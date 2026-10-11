"""Every email Vaada sends, as data. One layout renders them all, in HTML and in plain text."""

from dataclasses import dataclass, field
from datetime import datetime

from vaada.format import deed_number, ist_day, ist_moment, roman, rupees


@dataclass(frozen=True)
class Row:
    label: str
    value: str
    emphasis: bool = False


@dataclass(frozen=True)
class Action:
    label: str
    url: str


@dataclass(frozen=True)
class Message:
    subject: str
    heading: str
    paragraphs: list[str]
    deed_no: str = ""
    rows: list[Row] = field(default_factory=list)
    action: Action | None = None

    @property
    def preview(self) -> str:
        return self.paragraphs[0] if self.paragraphs else self.heading

    def as_text(self) -> str:
        lines = [f"VAADA · वादा{f' · DEED No. {self.deed_no}' if self.deed_no else ''}", "", self.heading, ""]
        lines += [p for para in self.paragraphs for p in (para, "")]
        if self.rows:
            width = max(len(r.label) for r in self.rows)
            lines += [f"{r.label.ljust(width)}  {r.value}" for r in self.rows] + [""]
        if self.action:
            lines += [f"{self.action.label}: {self.action.url}", ""]
        lines.append(
            "Vaada helps people write down what they agreed. It is not a lawyer, and a Vaada deed is not "
            "stamped under the Indian Stamp Act. Money on Vaada is held by Razorpay, not by us."
        )
        return "\n".join(lines)


@dataclass(frozen=True)
class DealFacts:
    deed_no: int
    title: str
    maker: str
    client: str
    room_url: str
    deed_url: str
    client_fee_paise: int = 0
    review_days: int = 5
    buffer_hours: int = 24

    @property
    def no(self) -> str:
        return deed_number(self.deed_no)

    @property
    def fee_not_refunded(self) -> str:
        """Said only when there was a processing fee; with Razorpay's customer-fee model there is none from Vaada."""
        return " The processing fee is not refunded." if self.client_fee_paise else ""

    @property
    def unanswered_release(self) -> str:
        """When a delivered part is released if the Client neither approves nor disputes it, as the deed words it."""
        return f"{_span(self.buffer_hours)} after its {_count_word(self.review_days)}-day review ends"


@dataclass(frozen=True)
class MilestoneFacts:
    idx: int
    title: str
    amount_paise: int
    transfer_paise: int

    @property
    def label(self) -> str:
        return f"milestone {roman(self.idx)}, {self.title}"


NUMBER_WORDS = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten")


def _count_word(n: int) -> str:
    return NUMBER_WORDS[n] if 0 <= n < len(NUMBER_WORDS) else str(n)


def _span(hours: int) -> str:
    if hours % 24:
        return f"{_count_word(hours)} hour{'s' if hours != 1 else ''}"
    days = hours // 24
    return f"{_count_word(days)} day{'s' if days != 1 else ''}"


SETTLEMENT = "Razorpay pays it out on the next settlement, usually within two working days."


def deed_sent(d: DealFacts, *, total_paise: int, client_fee_paise: int, first_due: datetime) -> Message:
    return Message(
        subject=f"{d.maker} has sent you a deed to look over",
        heading=f"{d.maker} has written down what you agreed.",
        deed_no=d.no,
        paragraphs=[
            f"It's Deed No. {d.no}, for {d.title}. Read it through, and if it's right, accept it and pay. "
            "The money is held by Razorpay and only reaches "
            f"{d.maker} as each part of the work is approved, or {d.unanswered_release} if you say nothing.",
            f"The deed can be accepted until {ist_day(first_due)}.",
        ],
        rows=[
            Row("Deal total", rupees(total_paise)),
            *([Row("Processing fee (not refundable)", rupees(client_fee_paise))] if client_fee_paise else []),
            Row("You pay", rupees(total_paise + client_fee_paise), emphasis=True),
        ],
        action=Action("Read the deed", d.deed_url),
    )


def deed_accepted(d: DealFacts, *, accepted_at: datetime, pay_by: datetime) -> Message:
    return Message(
        subject=f"{d.client} accepted Deed No. {d.no}",
        heading=f"{d.client} accepted the deed.",
        deed_no=d.no,
        paragraphs=[
            f"They accepted it on {ist_moment(accepted_at)}. The next step is theirs: paying, which they can do "
            f"until {ist_day(pay_by)}. We'll write as soon as the money is held.",
        ],
        action=Action("Open the deal room", d.room_url),
    )


def deal_funded(d: DealFacts, *, role: str, total_paise: int, first_due: datetime) -> Message:
    if role == "maker":
        paragraphs = [
            f"{d.client} has paid, and {rupees(total_paise)} is now held by Razorpay for this deed. "
            "None of it can be taken back without your agreement, a missed deadline, or a decision on a dispute.",
            f"The first milestone is due on {ist_day(first_due)}. Mark it delivered from the deal room when it's done.",
        ]
    else:
        paragraphs = [
            f"Your payment went through. {rupees(total_paise)} is held by Razorpay and goes to {d.maker} "
            f"one milestone at a time, as you approve the work, or {d.unanswered_release} if you say nothing."
            + d.fee_not_refunded,
        ]
    return Message(
        subject=f"The money for Deed No. {d.no} is held",
        heading=f"{rupees(total_paise)} is held for Deed No. {d.no}.",
        deed_no=d.no,
        paragraphs=paragraphs,
        action=Action("Open the deal room", d.room_url),
    )


def milestone_delivered(
    d: DealFacts, m: MilestoneFacts, *, review_ends_at: datetime, hold_until: datetime, note: str | None
) -> Message:
    paragraphs = [
        f"{d.maker} has marked {m.label} as delivered." + (f" Their note: “{note}”" if note else ""),
        f"If you're happy with it, approve it and {rupees(m.transfer_paise)} goes to {d.maker}. {SETTLEMENT}",
        f"If you do nothing, Razorpay releases the money on {ist_moment(hold_until)}.",
        f"If something is wrong, you can raise a dispute until {ist_moment(review_ends_at)}. "
        "After that moment disputes for this milestone are closed.",
    ]
    return Message(
        subject=f"{d.maker} delivered {m.label}",
        heading=f"Milestone {roman(m.idx)} has been delivered.",
        deed_no=d.no,
        paragraphs=paragraphs,
        action=Action("Review the delivery", d.room_url),
    )


def review_closing(d: DealFacts, m: MilestoneFacts, *, review_ends_at: datetime, hold_until: datetime) -> Message:
    return Message(
        subject=f"Disputes for milestone {roman(m.idx)} close in 24 hours",
        heading="One day left to raise a problem.",
        deed_no=d.no,
        paragraphs=[
            f"You can raise a dispute about {m.label} until {ist_moment(review_ends_at)}.",
            f"If you don't, {rupees(m.transfer_paise)} releases to {d.maker} on {ist_moment(hold_until)}.",
        ],
        action=Action("Open the deal room", d.room_url),
    )


def milestone_released(d: DealFacts, m: MilestoneFacts, *, role: str, why: str, bank_last4: str | None) -> Message:
    account = f" ending {bank_last4}" if bank_last4 else ""
    if role == "maker":
        lead = f"{rupees(m.transfer_paise)} for {m.label} is released to your bank account{account}."
    else:
        lead = f"{rupees(m.transfer_paise)} for {m.label} is released to {d.maker}."
    return Message(
        subject=f"Milestone {roman(m.idx)} of Deed No. {d.no} is released",
        heading="Released.",
        deed_no=d.no,
        paragraphs=[lead, why, SETTLEMENT],
        action=Action("Open the deal room", d.room_url),
    )


def milestone_refunded(d: DealFacts, m: MilestoneFacts, *, refund_paise: int, why: str) -> Message:
    return Message(
        subject=f"{rupees(refund_paise)} is on its way back for Deed No. {d.no}",
        heading=f"{rupees(refund_paise)} is being returned to {d.client}.",
        deed_no=d.no,
        paragraphs=[
            f"This is for {m.label}. {why}",
            "Refunds reach the card, bank account or UPI app that paid, usually within five to seven working days."
            + d.fee_not_refunded,
        ],
        action=Action("Open the deal room", d.room_url),
    )


def cancellation_proposed(d: DealFacts, *, proposer: str, reason: str, effect: str) -> Message:
    return Message(
        subject=f"{proposer} has asked to cancel the rest of Deed No. {d.no}",
        heading=f"{proposer} has asked to cancel the rest of the deed.",
        deed_no=d.no,
        paragraphs=[f"Their reason: “{reason}”", f"If you agree: {effect}", "Nothing changes until you answer."],
        action=Action("Answer in the deal room", d.room_url),
    )


def cancellation_answered(d: DealFacts, *, responder: str, confirmed: bool) -> Message:
    if confirmed:
        return Message(
            subject=f"Deed No. {d.no} is cancelled",
            heading="The rest of the deed is cancelled.",
            deed_no=d.no,
            paragraphs=[
                f"{responder} agreed. Money held for work that wasn't delivered is going back to {d.client}; "
                "anything already delivered finishes its review as normal, and money already released stays released."
            ],
            action=Action("Open the deal room", d.room_url),
        )
    return Message(
        subject=f"{responder} wants to keep Deed No. {d.no} going",
        heading="The deed carries on.",
        deed_no=d.no,
        paragraphs=[f"{responder} declined to cancel. Nothing has changed."],
        action=Action("Open the deal room", d.room_url),
    )


def dispute_opened(d: DealFacts, m: MilestoneFacts, *, opener: str, reason: str) -> Message:
    return Message(
        subject=f"A dispute is open on Deed No. {d.no}",
        heading=f"{opener} has raised a problem with milestone {roman(m.idx)}.",
        deed_no=d.no,
        paragraphs=[
            f"Their reason: “{reason}”",
            f"The {rupees(m.amount_paise)} for {m.label} stays held until Vaada decides. We read both sides, may ask "
            "each of you a question, and decide to release, refund, or split it. Our decision settles the money held "
            "here and doesn't stop either of you going to court.",
        ],
        action=Action("Open the deal room", d.room_url),
    )


def dispute_resolved(d: DealFacts, m: MilestoneFacts, *, outcome: str, note: str) -> Message:
    return Message(
        subject=f"The dispute on Deed No. {d.no} is decided",
        heading=f"The dispute on milestone {roman(m.idx)} is decided.",
        deed_no=d.no,
        paragraphs=[outcome, f"Our note: “{note}”", SETTLEMENT],
        action=Action("Open the deal room", d.room_url),
    )


def deal_lapsed(d: DealFacts, *, why: str) -> Message:
    return Message(
        subject=f"Deed No. {d.no} has lapsed",
        heading="This deed has lapsed.",
        deed_no=d.no,
        paragraphs=[why, f"{d.maker} can re-issue it with new dates from the deal room."],
        action=Action("Open the deal room", d.room_url),
    )


def date_change_proposed(
    d: DealFacts, m: MilestoneFacts, *, proposer: str, old: datetime, new: datetime, reason: str
) -> Message:
    return Message(
        subject=f"{proposer} has asked to move a date on Deed No. {d.no}",
        heading=f"{proposer} has asked to move milestone {roman(m.idx)}.",
        deed_no=d.no,
        paragraphs=[
            f"From {ist_day(old)} to {ist_day(new)}." + (f" Their reason: “{reason}”" if reason else ""),
            "The date only changes if you agree.",
        ],
        action=Action("Answer in the deal room", d.room_url),
    )


def date_change_answered(d: DealFacts, m: MilestoneFacts, *, responder: str, agreed: bool, new: datetime) -> Message:
    return Message(
        subject=f"{responder} {'agreed to' if agreed else 'declined'} the new date on Deed No. {d.no}",
        heading=f"Milestone {roman(m.idx)} is now due {ist_day(new)}." if agreed else "The date stays as it was.",
        deed_no=d.no,
        paragraphs=[f"{responder} {'agreed' if agreed else 'declined'}."],
        action=Action("Open the deal room", d.room_url),
    )


def payout_status(*, name: str, status: str, payouts_url: str) -> Message:
    if status == "activated":
        heading, body = (
            "Your payout account is ready.",
            (
                "Razorpay has checked your bank account. You can now send deeds, and money released to you will "
                "reach that account on each settlement."
            ),
        )
    else:
        heading, body = (
            "Razorpay needs something from you.",
            ("Your payout account needs a correction before it can receive money. The payouts page says exactly what."),
        )
    return Message(
        subject=heading.rstrip("."),
        heading=heading,
        paragraphs=[f"Hello {name}.", body],
        action=Action("Open payouts", payouts_url),
    )
