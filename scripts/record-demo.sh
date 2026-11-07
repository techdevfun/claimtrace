#!/bin/sh
# record-demo.sh — record demo/transcript.txt from REAL claimtrace runs.
# Runs the built CLI for real against the repo fixtures and captures each
# command, its output, and its exit code. Re-run to refresh the transcript
# after any CLI output change.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# The built CLI must exist.
test -f "$ROOT/dist/cli.js" || {
  echo "dist/cli.js missing — run: npm run build" >&2
  exit 1
}

TRANSCRIPT="$ROOT/demo/transcript.txt"
: > "$TRANSCRIPT"

# run <cmd...> — appends "$ <cmd>" + output + "exit: N" to the transcript.
run() {
  echo "\$ $*" >> "$TRANSCRIPT"
  set +e
  node "$ROOT/dist/cli.js" "$@" >> "$TRANSCRIPT" 2>&1
  code=$?
  set -e
  echo "exit: $code" >> "$TRANSCRIPT"
}

run formats
run verify --report fixtures/report-overclaim.md --transcript fixtures/session-overclaim.jsonl
run verify --report fixtures/report-honest.md --transcript fixtures/session-overclaim.jsonl

echo "transcript: $TRANSCRIPT ($(wc -l < "$TRANSCRIPT") lines)"
