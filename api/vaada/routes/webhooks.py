from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from vaada.deps import Ctx
from vaada.money import webhooks
from vaada.ratelimit import rate_limit

router = APIRouter()


@router.post("/webhooks/razorpay")
async def razorpay_webhook(
    request: Request,
    ctx: Ctx,
    _: Annotated[None, Depends(rate_limit("webhooks", times=600, seconds=60))],
    x_razorpay_signature: Annotated[str | None, Header()] = None,
    x_razorpay_event_id: Annotated[str | None, Header()] = None,
) -> dict[str, bool]:
    """Verify, store, acknowledge. Processing happens in the worker, never in this request."""
    body = await request.body()
    try:
        new = await webhooks.ingest(ctx, body, x_razorpay_signature, x_razorpay_event_id)
    except webhooks.WebhookRejectedError as exc:
        raise HTTPException(status_code=400, detail="Webhook rejected.") from exc
    return {"accepted": True, "duplicate": not new}
