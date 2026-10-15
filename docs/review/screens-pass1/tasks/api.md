# Group: api (server-side wording, seed and records)

You own: api/vaada/** and api/tests/**. Run `cd /home/user/vaada/api && .venv/bin/ruff check vaada tests &&
.venv/bin/ruff format vaada tests && .venv/bin/mypy vaada && .venv/bin/pytest -q` and keep it all green; add tests
for what you change. Don't restart the running API or worker and don't reseed the dev database (I do that after).
For pytest, the test database is separate from the dev one (see api/tests/conftest.py); if it needs a service that
is down, say so.

1. Dispute window naming: the register says "Milestone II delivered. Disputes close 15 Oct 2026, 21:46 IST; the
   money releases…", the ledger says "in review until", the deed says "review period … raise a problem", the button
   says "Raise a problem". "Disputes close" also reads as disputes being settled. Word it as the deed does, e.g.
   register: "Milestone II delivered. Review ends 15 Oct 2026, 21:46 IST; if no problem is raised, the money
   releases 16 Oct 2026, 21:46 IST." and the dispute effect sentence "…You can raise a problem until …". Find every
   "Disputes close"/"disputes close" in api/vaada (delivery.py, views.py, email/messages.py) and make them agree.
2. Non-breaking spaces in ist_moment / ist_day output (api/vaada/format.py): inside "15 Oct 2026" and before "IST",
   so register summaries don't break a date across lines. Keep ", " between day and time (the web splits on it).
   Check that emails' plain-text output is still fine with U+00A0 (or use it only in strings meant for the web, if
   emails would suffer; your call, say which).
3. Maker certificate "since": "A Maker on Vaada since the 11th day of October, 2026" while listing releases from
   September. seed.py creates the personas before winding the clock back. Create them after the clock is set back
   (or set created_at from ctx.clock.now() then), and in the public maker route return min(created_at, earliest
   published_at of the maker's deeds) as `since`.
4. Seed wording: the seeded deeds' sentence slots carry Wispr capitals mid-sentence ("except Drafts aur jo concepts
   use nahi hue", "for Final logo files SVG PNG mein"). The web is adding a phrase normaliser that lowercases these
   on input; make the seed's values what that would produce (lowercase first word unless a name), so the demo's
   frozen deeds read right. Keep the Hinglish.
5. Ledger (api/vaada/ledger_view.py): order entries by (created_at, milestone idx nulls first, id) so part I comes
   before part II at the same minute; CSV header "Released to you (INR)" instead of "Received (INR)" and the
   docstring to match (keep internal field names).
6. Outbox (api/vaada/email/outbox.py, models/ops.py): letters are stamped with the database's now(), not the
   travelling dev clock, so the outbox dates disagree with every other record in dev/demo. Set created_at from
   ctx.clock.now() when queuing (keep the server default as a fallback).
