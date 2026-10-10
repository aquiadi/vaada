"""Deal terms. The browser normalizes dictation into blank values; this module re-validates every
value and every rule before anything is frozen."""

from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, ValidationError, field_validator, model_validator

from vaada.agreement import AGREEMENT_VERSION, end_of_day_ist, iso_utc, money
from vaada.money.fees import DealMoney

OPTIONAL_CLAUSES = ("late_fee", "kill_fee", "ip_transfer")
STRIKABLE = (*OPTIONAL_CLAUSES, "client_organisation")
MAX_MILESTONES = 12
MAX_REVISIONS = 20

Paise = Annotated[StrictInt, Field(gt=0, le=10_000_000_000)]
ShortText = Annotated[str, Field(min_length=1, max_length=160)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MilestoneTerms(Strict):
    title: Annotated[str, Field(min_length=1, max_length=120)]
    deliverables: Annotated[str, Field(min_length=1, max_length=2000)]
    amount_paise: Paise
    due_date: date


class LateFee(Strict):
    days: Annotated[StrictInt, Field(ge=1, le=60)]
    amount_paise: Paise


class KillFee(Strict):
    percent: Annotated[StrictInt, Field(ge=1, le=100)]


class IpTransfer(Strict):
    exclusions: Annotated[str, Field(min_length=1, max_length=500)]


class Terms(Strict):
    maker_name: ShortText
    client_name: ShortText
    client_organisation: Annotated[str, Field(max_length=160)] | None = None
    work: Annotated[str, Field(min_length=1, max_length=2000)]
    revisions: Annotated[StrictInt, Field(ge=0, le=MAX_REVISIONS)] | Literal["unlimited"]
    total_paise: Paise
    milestones: Annotated[list[MilestoneTerms], Field(min_length=1, max_length=MAX_MILESTONES)]
    late_fee: LateFee | None = None
    kill_fee: KillFee | None = None
    ip_transfer: IpTransfer | None = None

    @model_validator(mode="after")
    def _sums_and_order(self) -> "Terms":
        total = sum(m.amount_paise for m in self.milestones)
        if total != self.total_paise:
            raise ValueError(f"milestones add up to {total} paise but the total is {self.total_paise} paise")
        dates = [m.due_date for m in self.milestones]
        if dates != sorted(dates):
            raise ValueError("milestone due dates must not go backwards")
        return self


class BlankValue(BaseModel):
    model_config = ConfigDict(extra="ignore")
    raw: str = ""
    value: Any = None
    confidence: Literal["exact", "inferred", "failed"] | None = None
    note: str | None = None
    source: Literal["dictation", "plan"] | None = None
    dictationId: str | None = None


class Draft(BaseModel):
    """What the deed editor autosaves: every blank as the person left it."""

    model_config = ConfigDict(extra="forbid")
    blanks: dict[str, BlankValue] = Field(default_factory=dict)
    struck: list[str] = Field(default_factory=list)
    milestone_count: Annotated[int, Field(ge=0, le=MAX_MILESTONES)] = 0

    @field_validator("struck")
    @classmethod
    def _known_clauses(cls, v: list[str]) -> list[str]:
        unknown = set(v) - set(STRIKABLE)
        if unknown:
            raise ValueError(f"cannot strike {sorted(unknown)}")
        return sorted(set(v))


class Problem(BaseModel):
    blank: str
    message: str


class TermsProblems(Exception):
    def __init__(self, problems: list[Problem]) -> None:
        super().__init__("; ".join(f"{p.blank}: {p.message}" for p in problems))
        self.problems = problems


FILL_OR_STRIKE = "Fill this in, or strike the clause if it doesn't apply."
REQUIRED = "This blank needs filling before the deed can be sent."


def _blank(draft: Draft, key: str) -> BlankValue | None:
    b = draft.blanks.get(key)
    if b is None or (b.value is None and not b.raw.strip()):
        return None
    return b


def terms_from_draft(draft: Draft) -> Terms:
    """Builds strict terms from a draft, collecting a problem per blank so the deed can show each in its margin."""
    problems: list[Problem] = []
    values: dict[str, Any] = {}

    def take(key: str, *, required: bool = True, message: str = REQUIRED) -> Any:
        b = _blank(draft, key)
        if b is None:
            if required:
                problems.append(Problem(blank=key, message=message))
            return None
        if b.confidence == "failed" or b.value is None:
            problems.append(Problem(blank=key, message=b.note or "We couldn't read this blank. Check it."))
            return None
        return b.value

    for key in ("maker_name", "client_name", "work", "revisions", "total"):
        values[key] = take(key)
    values["client_organisation"] = (
        None if "client_organisation" in draft.struck else take("client_organisation", message=FILL_OR_STRIKE)
    )

    milestones: list[dict[str, Any]] = []
    if draft.milestone_count == 0:
        problems.append(Problem(blank="plan", message="Say how the money is split, or add the parts by hand."))
    for i in range(1, draft.milestone_count + 1):
        milestones.append(
            {
                "title": take(f"milestones.{i}.title"),
                "deliverables": take(f"milestones.{i}.deliverables"),
                "amount_paise": take(f"milestones.{i}.amount"),
                "due_date": take(f"milestones.{i}.due"),
            }
        )

    clauses: dict[str, Any] = {}
    clause_fields = {
        "late_fee": {"days": "late_fee.days", "amount_paise": "late_fee.amount"},
        "kill_fee": {"percent": "kill_fee.percent"},
        "ip_transfer": {"exclusions": "ip_transfer.exclusions"},
    }
    for clause, fields in clause_fields.items():
        if clause in draft.struck:
            clauses[clause] = None
            continue
        clauses[clause] = {name: take(key, message=FILL_OR_STRIKE) for name, key in fields.items()}

    if problems:
        raise TermsProblems(problems)
    try:
        return Terms(
            maker_name=values["maker_name"],
            client_name=values["client_name"],
            client_organisation=values["client_organisation"],
            work=values["work"],
            revisions=values["revisions"],
            total_paise=values["total"],
            milestones=[MilestoneTerms.model_validate(m) for m in milestones],
            **clauses,
        )
    except ValidationError as exc:
        raise TermsProblems([_problem_from_error(err) for err in exc.errors()]) from exc


def _problem_from_error(err: Any) -> Problem:
    loc = [str(p) for p in err.get("loc", ())]
    blank_names = {"total_paise": "total", "amount_paise": "amount", "due_date": "due"}
    if loc and loc[0] == "milestones" and len(loc) >= 3:
        blank = f"milestones.{int(loc[1]) + 1}.{blank_names.get(loc[2], loc[2])}"
    elif loc and loc[0] in OPTIONAL_CLAUSES and len(loc) >= 2:
        blank = f"{loc[0]}.{blank_names.get(loc[1], loc[1])}"
    elif loc:
        blank = blank_names.get(loc[0], loc[0])
    else:
        blank = "plan"
    message = str(err.get("msg", "Check this blank.")).removeprefix("Value error, ")
    return Problem(blank=blank, message=message[:1].upper() + message[1:])


def check_dates(terms: Terms, *, today: date, max_days: int) -> list[Problem]:
    problems: list[Problem] = []
    for i, m in enumerate(terms.milestones, start=1):
        if m.due_date < today:
            problems.append(Problem(blank=f"milestones.{i}.due", message="That date has already passed."))
        elif (m.due_date - today).days > max_days:
            problems.append(
                Problem(
                    blank=f"milestones.{i}.due",
                    message=f"A deal on Vaada can run at most {max_days} days from today, which keeps every "
                    "possible refund inside the banks' six-month window.",
                )
            )
    return problems


def agreement_document(
    *,
    deed_no: int,
    nonce: str,
    published_at: datetime,
    maker_id: str,
    terms: Terms,
    deal_money: DealMoney,
    policy: dict[str, int],
) -> dict[str, Any]:
    def clause(value: BaseModel | None) -> dict[str, Any] | None:
        if value is None:
            return None
        dumped = value.model_dump()
        return {k: money(v) if k.endswith("_paise") else v for k, v in dumped.items()}

    return {
        "v": AGREEMENT_VERSION,
        "deed_no": deed_no,
        "nonce": nonce,
        "published_at": iso_utc(published_at),
        "currency": "INR",
        "maker": {"name": terms.maker_name, "maker_id": maker_id},
        "client": {"name": terms.client_name, "organisation": terms.client_organisation},
        "work": {"description": terms.work, "revisions": terms.revisions},
        "money": {
            "total_paise": money(deal_money.total_paise),
            "client_fee_paise": money(deal_money.client_fee_paise),
            "platform_fee_paise": money(deal_money.platform_fee_paise),
        },
        "milestones": [
            {
                "idx": i,
                "title": m.title,
                "deliverables": m.deliverables,
                "amount_paise": money(m.amount_paise),
                "due_at": iso_utc(end_of_day_ist(m.due_date)),
            }
            for i, m in enumerate(terms.milestones, start=1)
        ],
        "clauses": {
            "late_fee": clause(terms.late_fee),
            "kill_fee": clause(terms.kill_fee),
            "ip_transfer": clause(terms.ip_transfer),
        },
        "policy": policy,
    }
