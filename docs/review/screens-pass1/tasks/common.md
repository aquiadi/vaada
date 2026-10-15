# Rules every fixer follows

The screenshot reviewers' full findings, with their evidence, are in
/home/user/vaada/docs/review/screens-pass1/pass1-front-editor.md and
/home/user/vaada/docs/review/screens-pass1/pass1-room-client-books.md
(and pass1-legal.md once the legal pages are reviewed). Your task file lists the ones that are yours, with the decision already made.
Re-shoot pass-1 screenshots with web/e2e/screens.spec.ts into a scratch directory if you need them (SCREENS_DIR=...).

Ownership. Edit only the files your task file says you own. If a fix needs a change in a file you don't own,
don't make it: put it under "Needs from others" in your report, exact enough to apply. Several fixers run at
the same time on one working tree, so never run git commands that change the tree (no checkout, stash, reset,
commit), and don't format or touch files outside your list.

Shared decisions (all groups rely on these, don't change them):
- A read-only deed (PublishedDeed) is a centred sheet `mx-auto max-w-[52rem]`; its 68ch text should fill it.
  Slips and panels that sit directly under a read-only deed on /a and /d use the same `max-w-[52rem] mx-auto`
  so their edges line up.
- Page bodies share the masthead's container: `mx-auto max-w-6xl px-6` (as in app/Shell.tsx). The editor may let
  its sheet bleed wider than that only with a negative margin, keeping its labels on the shared left edge.
- Print: use Tailwind `print:` variants in your own files for anything specific to your page. Only the shell
  group edits styles/index.css, and it adds the global print rules (section headings `break-after: avoid`,
  list items, table rows and figures `break-inside: avoid`, `@page { margin: 16mm }`, buttons hidden).
  Buttons and button-links (components/ui.tsx Button and ButtonLink) will be `print:hidden` globally, so you
  don't need to hide those one by one; hide other screen-only controls yourself with `no-print` or `print:hidden`.
- Bahi red is only for marks, marginalia rules, margin rules, the focused blank, the seal and destructive
  actions. Error and warning text is ink beside a bahi rule (`border-l-2 border-bahi pl-2 text-ink`).
- Typographic apostrophes and quotes (’ “ ”) in all user-visible text you touch.
- Code style: names explain, comments say why (sparingly, matching the file), no banners, no emoji, no dead
  code, no TODOs, specific error messages, no empty catch. Match the surrounding code.

E2E. Don't run the Playwright e2e or screens specs (they share the database and clock; I run them after you).
web/e2e/flow.spec.ts depends on these exact strings; keep them, or name the change in your report:
"Ready. Money released to you goes to the account ending" (payouts), the "Dev personas" complementary region
and its first button (persona slip at desktop width), "50% in advance, the rest on delivery", "Delivered, in
review until", "Released for the next settlement" (as the Maker sees it), "Refunded",
"I have read this deed and agree to it.", "Dev and demo only".

Verify before you report:
- `cd /home/user/vaada/web && npx tsc --noEmit` clean for the whole tree (if another group's in-progress edit
  breaks it, say which file), `npx eslint <your files>` clean, `npx vitest run` for anything you touched.
- Look at every route you changed in Chromium (Playwright, a throwaway script at web/.fix-<group>.mjs that you
  delete afterwards) at 1440x900 and 390x844, light and dark, and with `page.emulateMedia({media:"print"})`.
  The dev app is at http://127.0.0.1:5173, the API at http://127.0.0.1:8000. To be a persona: POST
  http://127.0.0.1:8000/dev/personas/<aditi|rahul|desk>/token, then page.addInitScript sets localStorage
  "vaada.persona" to JSON {token: access_token, name, email}. GET /deals with that bearer token lists ids/slugs.
  Never click anything that changes money or deal state (accept, pay, deliver, approve, send, cancel, dispute,
  delete, let time pass); mock the request with page.route if you need to see the result.
  If a service is down, say so; don't try to restart it.

Report: for each item, fixed / partly / not fixed and why, in a sentence or two; the files you changed;
"Needs from others"; anything you noticed that isn't on your list.
