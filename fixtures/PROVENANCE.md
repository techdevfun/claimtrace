# Fixture provenance

Every file in this directory is a **synthetic fixture created for this
repo's tests and demo**. None of them is a real agent session, and none
of them records real work:

- `session-overclaim.jsonl` — hand-written Claude Code-style session for
  a fictional project ("widget-shop"): 12 files in scope, 9 opened, one
  `npm test` run showing 43 passing / 2 failing, edits to 2 files.
- `report-overclaim.md` — the overclaiming report for that session.
- `report-honest.md` — the honest report for the same session.
- `session-truncated.jsonl` — the first 14 lines of the session plus a
  cut-off 15th line, to exercise fail-closed truncation handling.
- `session-secret.jsonl` / `report-secret.md` — a generic-format session
  whose captured output contains a clearly fake key
  (`FAKE-KEY-FOR-TESTS-ONLY-0000`), to prove verify output never prints
  transcript contents. The key is invented, has never been a real
  credential, and appears nowhere else.

No fixture file is presented as a real session anywhere in this repo.
