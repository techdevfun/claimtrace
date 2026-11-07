#!/usr/bin/env node
/**
 * replay-verify.js — replay the demo fixtures through the built CLI and
 * assert the gate fires where it must: the overclaiming report exits 1,
 * the honest report exits 0, the truncated transcript verifies nothing.
 * Used by CI as a recorded-fixture gate replay (no network, no model).
 */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "dist", "cli.js");

function run(...args) {
  return spawnSync("node", [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
}

function check(label, result, wantStatus, wantText) {
  if (result.status !== wantStatus) {
    console.error(`FAIL ${label}: exit ${result.status}, want ${wantStatus}`);
    console.error(result.stdout);
    process.exit(1);
  }
  if (wantText && !result.stdout.includes(wantText)) {
    console.error(`FAIL ${label}: output missing "${wantText}"`);
    console.error(result.stdout);
    process.exit(1);
  }
  console.log(`ok ${label}`);
}

check(
  "overclaim report exits 1",
  run("verify", "--report", "fixtures/report-overclaim.md", "--transcript", "fixtures/session-overclaim.jsonl"),
  1,
  "12 VERIFIED, 6 UNVERIFIED, 1 CONTRADICTED",
);
check(
  "honest report exits 0",
  run("verify", "--report", "fixtures/report-honest.md", "--transcript", "fixtures/session-overclaim.jsonl"),
  0,
  "14 VERIFIED, 0 UNVERIFIED, 0 CONTRADICTED",
);
check(
  "truncated transcript verifies nothing",
  run("verify", "--report", "fixtures/report-overclaim.md", "--transcript", "fixtures/session-truncated.jsonl"),
  1,
  "0 VERIFIED, 19 UNVERIFIED, 0 CONTRADICTED",
);
console.log("replay-verify OK: gate fires on the overclaim, passes on the honest report.");
