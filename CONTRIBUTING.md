# Contributing to claimtrace

Thanks for helping. This is a small, zero-dependency TypeScript CLI, and
contributions should stay that way.

## How to contribute

1. Fork the repo and create a branch for your change.
2. Run `npm install`, `npm run build`, and `npm test` — all tests must pass.
3. Add a test for any new claim type, transcript shape, or verdict rule.
   Fixtures go in `fixtures/` with a line in `fixtures/PROVENANCE.md`.
4. Run `node scripts/preflight.js` — public content must be English only,
   with no internal names.
5. Open a pull request describing the behavior change, not just the diff.

## Rules for new claim types

- A claim type must be checkable against transcript evidence alone.
  No model calls, no hidden oracle, no network.
- If the evidence is missing or ambiguous, the verdict is UNVERIFIED —
  never guess, never silently pass.
- Every verdict needs a `transcript:<line>` pointer where one exists.
- Keep the CLI deterministic: same report + same transcript = same output.

## Reporting bugs

Open an issue with the smallest report + transcript pair that reproduces
the problem. Paste the claim text and the verdict you expected. Do not
paste real credentials or private session logs — replace secrets with a
clearly fake placeholder first.
