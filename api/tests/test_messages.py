from vaada.email.messages import DealFacts

FACTS = DealFacts(
    deed_no=7,
    title="a logo",
    maker="Aditi",
    client="Rahul",
    room_url="https://vaada.test/d/x",
    deed_url="https://vaada.test/a/x",
)


def test_release_timing_reads_like_the_deed() -> None:
    assert FACTS.unanswered_release == "one day after its five-day review ends"


def test_release_timing_follows_the_settings() -> None:
    facts = DealFacts(**{**FACTS.__dict__, "review_days": 3, "buffer_hours": 48})
    assert facts.unanswered_release == "two days after its three-day review ends"


def test_release_timing_in_hours_when_not_whole_days() -> None:
    facts = DealFacts(**{**FACTS.__dict__, "buffer_hours": 12})
    assert facts.unanswered_release == "12 hours after its five-day review ends"
