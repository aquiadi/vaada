"""Payout setup: a Route linked account per freelancer. Sensitive fields pass straight through to
Razorpay; we keep the ids, the status Razorpay reports, the IFSC and the last four digits."""

import logging
import re
import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select

from vaada.context import AppContext
from vaada.db import transaction
from vaada.email import messages
from vaada.email.outbox import queue_email
from vaada.models import PayoutAccount, User
from vaada.models.enums import PayoutStatus
from vaada.money.errors import GatewayTroubleError, MoneyError
from vaada.money.gateway import (
    GatewayRejectedError,
    GatewayUnavailableError,
    LinkedAccountProfile,
    ProductConfig,
    SettlementDetails,
)

log = logging.getLogger(__name__)

STATUS_FROM_RAZORPAY: dict[str, PayoutStatus] = {
    "requested": PayoutStatus.DRAFT,
    "created": PayoutStatus.DRAFT,
    "under_review": PayoutStatus.UNDER_REVIEW,
    "needs_clarification": PayoutStatus.NEEDS_CLARIFICATION,
    "activated": PayoutStatus.ACTIVATED,
    "suspended": PayoutStatus.SUSPENDED,
    "rejected": PayoutStatus.REJECTED,
}

FIELD_FOR_REASON = {"invalid_pan": "pan", "invalid_ifsc": "ifsc", "invalid_account_number": "account_number"}


class PayoutForm(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    legal_name: str = Field(min_length=2, max_length=120)
    business_type: Literal["individual", "proprietorship"]
    pan: str = Field(min_length=10, max_length=10)
    account_number: str = Field(min_length=9, max_length=18)
    ifsc: str = Field(min_length=11, max_length=11)
    street1: str = Field(min_length=3, max_length=100)
    street2: str = Field(default="", max_length=100)
    city: str = Field(min_length=2, max_length=60)
    state: str = Field(min_length=2, max_length=60)
    postal_code: str = Field(pattern=r"^\d{6}$")
    phone: str = Field(pattern=r"^\+?\d{10,13}$")

    @field_validator("pan", "ifsc")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()

    @field_validator("pan")
    @classmethod
    def _pan_shape(cls, v: str) -> str:
        if not re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", v):
            raise ValueError("A PAN looks like ABCDE1234F.")
        return v

    @field_validator("ifsc")
    @classmethod
    def _ifsc_shape(cls, v: str) -> str:
        if not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", v):
            raise ValueError("An IFSC looks like HDFC0001234.")
        return v

    @field_validator("account_number")
    @classmethod
    def _digits(cls, v: str) -> str:
        v = v.replace(" ", "")
        if not v.isdigit():
            raise ValueError("A bank account number is digits only.")
        return v

    def __repr__(self) -> str:
        return f"PayoutForm(business_type={self.business_type!r}, ifsc={self.ifsc!r})"

    __str__ = __repr__


class PayoutProblem(MoneyError):
    def __init__(self, message: str, field: str | None) -> None:
        super().__init__(message, status_code=422, code="payout_rejected")
        self.field = field


async def setup(ctx: AppContext, user: User, form: PayoutForm) -> PayoutAccount:
    """Runs the four Route onboarding calls. Each id is saved as soon as it exists, so a failure part
    way through resumes from the step that failed instead of creating a second account."""
    if not user.email:
        raise MoneyError("Your account needs an email address before payouts can be set up.", status_code=422)
    async with transaction(ctx.sessions) as session:
        account = (
            await session.execute(select(PayoutAccount).where(PayoutAccount.user_id == user.id).with_for_update())
        ).scalar_one_or_none()
        if account is None:
            account = PayoutAccount(user_id=user.id, status=PayoutStatus.DRAFT)
            session.add(account)
            await session.flush()
        if account.status == PayoutStatus.ACTIVATED:
            raise MoneyError("Your payout account is already active. Write to us to change it.")
        account_pk = account.id

    async def save(**values: Any) -> PayoutAccount:
        async with transaction(ctx.sessions) as session:
            stored = await session.get(PayoutAccount, account_pk, with_for_update=True)
            assert stored is not None
            for key, value in values.items():
                setattr(stored, key, value)
            return stored

    try:
        if not account.razorpay_account_id:
            account_id = await ctx.gateway.create_linked_account(
                LinkedAccountProfile(
                    email=user.email,
                    phone=form.phone,
                    legal_name=form.legal_name,
                    business_type=form.business_type,
                    pan=form.pan,
                    street1=form.street1,
                    street2=form.street2,
                    city=form.city,
                    state=form.state,
                    postal_code=form.postal_code,
                    reference_id=user.id.hex[:20],
                )
            )
            account = await save(
                razorpay_account_id=account_id, legal_name=form.legal_name, business_type=form.business_type
            )
        if not account.stakeholder_id:
            stakeholder_id = await ctx.gateway.create_stakeholder(
                account.razorpay_account_id or "", name=form.legal_name, email=user.email, pan=form.pan
            )
            account = await save(stakeholder_id=stakeholder_id)
        if not account.product_config_id:
            product = await ctx.gateway.request_route_product(account.razorpay_account_id or "")
            account = await save(product_config_id=product.id)
        product = await ctx.gateway.update_route_settlement(
            account.razorpay_account_id or "",
            account.product_config_id or "",
            SettlementDetails(account_number=form.account_number, ifsc=form.ifsc, beneficiary_name=form.legal_name),
        )
    except GatewayUnavailableError as exc:
        raise GatewayTroubleError() from exc
    except GatewayRejectedError as exc:
        raise PayoutProblem(f"Razorpay didn't accept this: {exc}", FIELD_FOR_REASON.get(exc.reason or "")) from exc
    return await save(
        status=STATUS_FROM_RAZORPAY.get(product.activation_status, PayoutStatus.UNDER_REVIEW),
        requirements=product.requirements,
        bank_last4=form.account_number[-4:],
        ifsc=form.ifsc,
        legal_name=form.legal_name,
        business_type=form.business_type,
    )


async def _apply_product(ctx: AppContext, account_pk: uuid.UUID, product: ProductConfig) -> PayoutAccount:
    async with transaction(ctx.sessions) as session:
        account = await session.get(PayoutAccount, account_pk, with_for_update=True)
        assert account is not None
        before = account.status
        account.status = STATUS_FROM_RAZORPAY.get(product.activation_status, account.status)
        account.requirements = product.requirements
        if account.status == PayoutStatus.ACTIVATED and account.activated_at is None:
            account.activated_at = ctx.clock.now()
        if before != account.status and account.status in (PayoutStatus.ACTIVATED, PayoutStatus.NEEDS_CLARIFICATION):
            user = await session.get(User, account.user_id)
            if user is not None:
                queue_email(
                    session,
                    to=user.email,
                    template="payout_status",
                    message=messages.payout_status(
                        name=account.legal_name or user.display_name or "there",
                        status=account.status.value,
                        payouts_url=f"{ctx.settings.web_origin}/payouts",
                    ),
                )
        return account


async def refresh(ctx: AppContext, user: User) -> PayoutAccount | None:
    async with ctx.sessions() as session:
        account = (
            await session.execute(select(PayoutAccount).where(PayoutAccount.user_id == user.id))
        ).scalar_one_or_none()
    if account is None or not account.razorpay_account_id or not account.product_config_id:
        return account
    try:
        product = await ctx.gateway.fetch_route_product(account.razorpay_account_id, account.product_config_id)
    except GatewayUnavailableError as exc:
        raise GatewayTroubleError() from exc
    return await _apply_product(ctx, account.id, product)


async def route_event(
    ctx: AppContext, *, account_id: str | None, event_type: str, entity: dict[str, Any] | None
) -> None:
    if not account_id:
        return
    async with ctx.sessions() as session:
        account = (
            await session.execute(select(PayoutAccount).where(PayoutAccount.razorpay_account_id == account_id))
        ).scalar_one_or_none()
    if account is None or not account.product_config_id:
        log.info("route event %s for unknown account", event_type)
        return
    try:
        product = await ctx.gateway.fetch_route_product(account_id, account.product_config_id)
    except GatewayUnavailableError:
        status = event_type.rsplit(".", 1)[-1]
        product = ProductConfig(
            id=account.product_config_id,
            account_id=account_id,
            activation_status=status,
            requirements=list((entity or {}).get("requirements") or []),
        )
    await _apply_product(ctx, account.id, product)
