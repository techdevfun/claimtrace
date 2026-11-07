/** Unit tests for claim extraction, transcript parsing and verification. */
import test from "node:test";
import assert from "node:assert/strict";
import { extractClaims } from "../dist/claims.js";
import { parseTestCounts, parseTranscript } from "../dist/transcript.js";
import { exitCode, verifyClaims } from "../dist/verify.js";

const SESSION = [
  '{"tool":"Read","file":"src/auth.ts"}',
  '{"tool":"Bash","command":"npm test","output":"43 passing\\n2 failing","exit_code":1}',
  '{"tool":"Edit","file":"src/auth.ts"}',
  '{"tool":"Edit","file":"src/cart.ts"}',
].join("\n");

test("extract: coverage claim", () => {
  const { claims } = extractClaims("Reviewed all 12 files in scope.");
  assert.equal(claims.length, 1);
  assert.equal(claims[0].type, "coverage");
  assert.equal(claims[0].count, 12);
});

test("extract: test-run all-N-pass", () => {
  const { claims } = extractClaims("All 45 tests pass.");
  assert.equal(claims.length, 1);
  assert.equal(claims[0].type, "test-run");
  assert.equal(claims[0].count, 45);
});

test("extract: test-run N-of-M pass", () => {
  const { claims } = extractClaims("43 of 45 tests pass (2 failing).");
  assert.equal(claims.length, 1);
  assert.equal(claims[0].passing, 43);
  assert.equal(claims[0].count, 45);
});

test("extract: ran command", () => {
  const { claims } = extractClaims("Ran `npm test`.");
  assert.equal(claims.length, 1);
  assert.equal(claims[0].type, "test-run");
  assert.equal(claims[0].command, "npm test");
});

test("extract: defect count and per-file defect", () => {
  const { claims } = extractClaims(
    "Fixed 3 defects.\nFixed defect 1 in `src/auth.ts`: null-check.",
  );
  const count = claims.find((c) => c.type === "defect-fixed" && c.count === 3);
  const perFile = claims.find((c) => c.type === "defect-fixed" && c.file === "src/auth.ts");
  assert.ok(count);
  assert.ok(perFile);
});

test("extract: file-opened backtick and bare", () => {
  const { claims } = extractClaims("Reviewed `src/a.ts`.\nOpened src/b.ts.");
  const files = claims.filter((c) => c.type === "file-opened").map((c) => c.file);
  assert.deepEqual(files.sort(), ["src/a.ts", "src/b.ts"]);
});

test("extract: same file phrased two ways is one claim", () => {
  const { claims } = extractClaims("Reviewed `src/a.ts`.\nReviewed src/a.ts.");
  assert.equal(claims.filter((c) => c.type === "file-opened").length, 1);
});

test("extract: unparsed claim-like sentence is reported, never verified", () => {
  const { claims, unparsed } = extractClaims("Reviewed 9 files in scope.");
  assert.equal(claims.length, 0);
  assert.equal(unparsed.length, 1);
  assert.match(unparsed[0], /Reviewed 9 files/);
});

test("transcript: generic JSONL parses reads, commands and edits with line numbers", () => {
  const t = parseTranscript(SESSION);
  assert.equal(t.truncated, false);
  assert.equal(t.events.filter((e) => e.kind === "read").length, 1);
  assert.equal(t.events.find((e) => e.kind === "read")?.line, 1);
  assert.equal(t.events.find((e) => e.kind === "command")?.line, 2);
  assert.equal(t.events.filter((e) => e.kind === "edit").length, 2);
});

test("transcript: Claude Code session shape pairs tool_result output to the command", () => {
  const text = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"u1","name":"Bash","input":{"command":"npm test"}}]}}',
    '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"u1","content":"43 passing\\n2 failing"}]}}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"u2","name":"Read","input":{"file_path":"src/a.ts"}}]}}',
  ].join("\n");
  const t = parseTranscript(text);
  assert.equal(t.format, "claude-code-session");
  const cmd = t.events.find((e) => e.kind === "command");
  assert.ok(cmd?.output?.includes("43 passing"));
  assert.equal(t.events.find((e) => e.kind === "read")?.file, "src/a.ts");
});

test("transcript: cut line marks the log truncated (fail-closed)", () => {
  const t = parseTranscript('{"tool":"Read","file":"src/a.ts"}\n{"tool":"Read","file":"src/b');
  assert.equal(t.truncated, true);
  assert.equal(t.truncatedAt, 2);
});

test("transcript: explicit truncated marker", () => {
  const t = parseTranscript('{"tool":"Read","file":"src/a.ts"}\n{"truncated":true}');
  assert.equal(t.truncated, true);
  assert.equal(t.truncatedAt, 2);
});

test("parseTestCounts: passing/failing, summary and ratio forms", () => {
  assert.deepEqual(parseTestCounts("43 passing\n2 failing"), { passing: 43, failing: 2 });
  assert.deepEqual(parseTestCounts("Tests: 45 passed, 0 failed"), { passing: 45, failing: 0 });
  assert.deepEqual(parseTestCounts("45/45 tests pass"), { passing: 45, failing: 0 });
  assert.equal(parseTestCounts("no numbers here"), null);
});

test("verify: file-opened VERIFIED vs UNVERIFIED", () => {
  const t = parseTranscript(SESSION);
  const { rows } = verifyClaims(
    [
      { type: "file-opened", text: "Reviewed `src/auth.ts`.", file: "src/auth.ts" },
      { type: "file-opened", text: "Reviewed `src/missing.ts`.", file: "src/missing.ts" },
    ],
    t,
  );
  assert.equal(rows[0].verdict, "VERIFIED");
  assert.equal(rows[0].evidence, "transcript:1");
  assert.equal(rows[1].verdict, "UNVERIFIED");
  assert.equal(rows[1].evidence, "-");
});

test("verify: test-run CONTRADICTED on count mismatch", () => {
  const t = parseTranscript(SESSION);
  const { rows } = verifyClaims(
    [{ type: "test-run", text: "All 45 tests pass.", count: 45 }],
    t,
  );
  assert.equal(rows[0].verdict, "CONTRADICTED");
  assert.match(rows[0].detail, /43 passing, 2 failing/);
});

test("verify: test-run VERIFIED on matching counts", () => {
  const t = parseTranscript(SESSION);
  const { rows } = verifyClaims(
    [{ type: "test-run", text: "43 of 45 tests pass.", passing: 43, count: 45 }],
    t,
  );
  assert.equal(rows[0].verdict, "VERIFIED");
});

test("verify: stricter command claim does NOT verify against a weaker run", () => {
  // Council probe (2026-11-07): transcript ran only "npm test"; a claim of
  // "npm test --watch" must be UNVERIFIED, while the exact claim verifies.
  const t = parseTranscript(SESSION);
  const { rows } = verifyClaims(
    [
      { type: "test-run", text: "Ran `npm test --watch`.", command: "npm test --watch" },
      { type: "test-run", text: "Ran `npm test`.", command: "npm test" },
    ],
    t,
  );
  assert.equal(rows[0].verdict, "UNVERIFIED");
  assert.equal(rows[1].verdict, "VERIFIED");
});

test("verify: defect-fixed VERIFIED vs UNVERIFIED", () => {
  const t = parseTranscript(SESSION);
  const { rows } = verifyClaims(
    [
      { type: "defect-fixed", text: "Fixed defect 1 in `src/auth.ts`.", file: "src/auth.ts" },
      { type: "defect-fixed", text: "Fixed defect 3 in `src/pricing.ts`.", file: "src/pricing.ts" },
      { type: "defect-fixed", text: "Fixed 3 defects.", count: 3 },
    ],
    t,
  );
  assert.equal(rows[0].verdict, "VERIFIED");
  assert.equal(rows[1].verdict, "UNVERIFIED");
  assert.equal(rows[2].verdict, "UNVERIFIED"); // only 2 edits in transcript
  assert.match(rows[2].detail, /only 2 edit/);
});

test("verify: coverage lists the unopened files", () => {
  const t = parseTranscript(SESSION);
  const { rows } = verifyClaims(
    [
      { type: "coverage", text: "Reviewed all 2 files.", count: 2 },
      { type: "file-opened", text: "Reviewed `src/auth.ts`.", file: "src/auth.ts" },
      { type: "file-opened", text: "Reviewed `src/missing.ts`.", file: "src/missing.ts" },
    ],
    t,
  );
  assert.equal(rows[0].verdict, "UNVERIFIED");
  assert.match(rows[0].detail, /src\/missing\.ts/);
});

test("verify: truncated transcript verifies nothing (fail-closed)", () => {
  const t = parseTranscript('{"tool":"Read","file":"src/auth.ts"}\n{"tool":"Read","file":"src/b');
  const v = verifyClaims(
    [{ type: "file-opened", text: "Reviewed `src/auth.ts`.", file: "src/auth.ts" }],
    t,
  );
  assert.equal(v.rows[0].verdict, "UNVERIFIED");
  assert.match(v.rows[0].detail, /fail-closed/);
  assert.equal(exitCode(v), 1);
});

test("verify: exit code 0 when every claim is VERIFIED", () => {
  const t = parseTranscript(SESSION);
  const v = verifyClaims(
    [{ type: "file-opened", text: "Reviewed `src/auth.ts`.", file: "src/auth.ts" }],
    t,
  );
  assert.equal(exitCode(v), 0);
});

test("verify: no secret leakage — output carries pointers, never transcript content", () => {
  const t = parseTranscript(
    '{"tool":"Bash","command":"npm test","output":"43 passing\\napi_key=FAKE-KEY-FOR-TESTS-ONLY-0000","exit_code":0}',
  );
  const v = verifyClaims(
    [{ type: "test-run", text: "Ran `npm test`.", command: "npm test" }],
    t,
  );
  const rendered = JSON.stringify(v);
  assert.equal(rendered.includes("FAKE-KEY-FOR-TESTS-ONLY-0000"), false);
});
