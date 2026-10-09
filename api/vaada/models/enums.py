from enum import StrEnum


class PayoutStatus(StrEnum):
    DRAFT = "draft"
    UNDER_REVIEW = "under_review"
    NEEDS_CLARIFICATION = "needs_clarification"
    ACTIVATED = "activated"
    SUSPENDED = "suspended"
    REJECTED = "rejected"


class DealStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ACCEPTED = "accepted"
    LAPSED = "lapsed"
    FUNDED = "funded"
    ACTIVE = "active"
    COMPLETED = "completed"
    DISPUTED = "disputed"
    CANCELLED = "cancelled"


class MilestoneStatus(StrEnum):
    UNFUNDED = "unfunded"
    HELD = "held"
    DELIVERED = "delivered"
    RELEASED = "released"
    REFUND_REQUESTED = "refund_requested"
    REFUNDED = "refunded"
    DISPUTED = "disputed"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"


class PaymentStatus(StrEnum):
    CREATED = "created"
    AUTHORIZED = "authorized"
    CAPTURED = "captured"
    FAILED = "failed"


class LedgerKind(StrEnum):
    CAPTURED = "captured"
    HELD = "held"
    HOLD_EXTENDED = "hold_extended"
    RELEASED = "released"
    REVERSED = "reversed"
    REFUNDED = "refunded"
    REFUND_FAILED = "refund_failed"
    FEE_RETAINED = "fee_retained"
    FEE_RETURNED = "fee_returned"
    TDS_WITHHELD = "tds_withheld"
    TDS_RETURNED = "tds_returned"
    TRANSFER_FAILED = "transfer_failed"


class RegistryKind(StrEnum):
    PUBLISHED = "Published"
    ACCEPTED = "Accepted"
    FUNDED = "Funded"
    DELIVERED = "Delivered"
    RELEASED = "Released"
    REFUNDED = "Refunded"
    DISPUTED = "Disputed"
    RESOLVED = "Resolved"
    CANCELLED = "Cancelled"

    @property
    def code(self) -> int:
        return list(RegistryKind).index(self)


class RegistryStatus(StrEnum):
    QUEUED = "queued"
    SENT = "sent"
    CONFIRMED = "confirmed"
    FAILED = "failed"


class Confidence(StrEnum):
    EXACT = "exact"
    INFERRED = "inferred"
    FAILED = "failed"


class VoiceUpdateStatus(StrEnum):
    PROPOSED = "proposed"
    APPLIED = "applied"
    PARTIALLY_APPLIED = "partially_applied"
    DISMISSED = "dismissed"


class DisputeStatus(StrEnum):
    OPEN = "open"
    RESOLVED = "resolved"


class DisputeResolution(StrEnum):
    RELEASE = "release"
    REFUND = "refund"
    SPLIT = "split"


class ProposalStatus(StrEnum):
    PROPOSED = "proposed"
    CONFIRMED = "confirmed"
    DECLINED = "declined"
    WITHDRAWN = "withdrawn"


class FlagKind(StrEnum):
    DRIFT = "drift"
    TRANSFER_FAILED = "transfer_failed"
    REFUND_DEADLINE = "refund_deadline"
    REFUND_STUCK = "refund_stuck"
    HOLD_NOT_CONFIRMED = "hold_not_confirmed"
    PAYMENT_ON_CLOSED_DEAL = "payment_on_closed_deal"
    FEE_EXCEEDED = "fee_exceeded"


class EmailStatus(StrEnum):
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"


class Role(StrEnum):
    MAKER = "maker"
    CLIENT = "client"
    SYSTEM = "system"
    ADMIN = "admin"
