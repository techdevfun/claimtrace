/** End-to-end tests: the built CLI against the repo fixtures. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "dist", "cli.js");

function run(...args) {
  return spawnSync("node", [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
}

test("e2e: overclaim fixture exits 1 with CONTRADICTED test claim and UNVERIFIED files", () => {
  const r = run(
    "verify",
    "--report", "fixtures/report-overclaim.md",
    "--transcript", "fixtures/session-overclaim.jsonl",
  );
  assert.equal(r.status, 1);
  assert.match(r.stdout, /CONTRADICTED/);
  assert.match(r.stdout, /UNVERIFIED/);
  assert.match(r.stdout, /12 VERIFIED, 6 UNVERIFIED, 1 CONTRADICTED/);
  assert.match(r.stdout, /transcript:20/);
  assert.match(r.stdout, /unopened: src\/pricing\.ts, src\/search\.ts, src\/webhooks\.ts/);
});

test("e2e: honest fixture exits 0, all VERIFIED", () => {
  const r = run(
    "verify",
    "--report", "fixtures/report-honest.md",
    "--transcript", "fixtures/session-overclaim.jsonl",
  );
  assert.equal(r.status, 0);
  assert.match(r.stdout, /14 VERIFIED, 0 UNVERIFIED, 0 CONTRADICTED/);
});

test("e2e: truncated transcript exits 1, nothing verified", () => {
  const r = run(
    "verify",
    "--report", "fixtures/report-overclaim.md",
    "--transcript", "fixtures/session-truncated.jsonl",
  );
  assert.equal(r.status, 1);
  assert.match(r.stdout, /0 VERIFIED, 19 UNVERIFIED, 0 CONTRADICTED/);
  assert.match(r.stdout, /fail-closed/);
});

test("e2e: --format json is valid JSON with the same summary", () => {
  const r = run(
    "verify",
    "--report", "fixtures/report-overclaim.md",
    "--transcript", "fixtures/session-overclaim.jsonl",
    "--format", "json",
  );
  assert.equal(r.status, 1);
  const data = JSON.parse(r.stdout);
  assert.deepEqual(data.summary, { verified: 12, unverified: 6, contradicted: 1 });
  assert.equal(data.claims.length, 19);
  assert.equal(data.truncated, false);
});

test("e2e: extract lists all 19 claims and exits 0", () => {
  const r = run("extract", "--report", "fixtures/report-overclaim.md");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /claims found: 19/);
  assert.match(r.stdout, /\[coverage\] Reviewed all 12 files/);
});

test("e2e: formats lists the four supported transcript formats", () => {
  const r = run("formats");
  assert.equal(r.status, 0);
  for (const name of ["claude-code-session", "codex-exec-json", "opencode-session", "generic-jsonl"]) {
    assert.ok(r.stdout.includes(name), `formats output missing ${name}`);
  }
});

test("e2e: missing report file exits 2", () => {
  const r = run("verify", "--report", "fixtures/no-such-report.md", "--transcript", "fixtures/session-overclaim.jsonl");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not found/);
});

test("e2e: missing transcript file exits 2", () => {
  const r = run("verify", "--report", "fixtures/report-honest.md", "--transcript", "fixtures/no-such.jsonl");
  assert.equal(r.status, 2);
});

test("e2e: report with no claims exits 2", () => {
  const r = run("verify", "--report", "fixtures/PROVENANCE.md", "--transcript", "fixtures/session-overclaim.jsonl");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no claims found/);
});

test("e2e: unknown command exits 2", () => {
  const r = run("frobnicate");
  assert.equal(r.status, 2);
});

test("e2e: --help exits 0", () => {
  const r = run("--help");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /claimtrace verify/);
});

test("e2e: secret in transcript output never appears in CLI output", () => {
  const r = run(
    "verify",
    "--report", "fixtures/report-secret.md",
    "--transcript", "fixtures/session-secret.jsonl",
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout.includes("FAKE-KEY-FOR-TESTS-ONLY-0000"), false);
  assert.equal(r.stderr.includes("FAKE-KEY-FOR-TESTS-ONLY-0000"), false);
});
