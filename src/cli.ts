#!/usr/bin/env node
/**
 * claimtrace — verify an agent's report against its own transcript.
 *
 *   claimtrace verify --report <report.md> --transcript <session.jsonl> [--format table|json]
 *   claimtrace extract --report <report.md>
 *   claimtrace formats
 *
 * Exit codes: 0 = every claim VERIFIED; 1 = any claim UNVERIFIED or
 * CONTRADICTED; 2 = usage error, missing file, or unparseable input.
 * No model call, no account, no network. Deterministic patterns only.
 */
import { readFileSync } from "node:fs";
import { extractClaims } from "./claims.js";
import { parseTranscript } from "./transcript.js";
import { exitCode, verifyClaims } from "./verify.js";
import { renderExtract, renderFormats, renderJson, renderTable } from "./render.js";

const VERSION = "0.1.0";

function usage(): string {
  return [
    "claimtrace 0.1.0 — verify an agent's report against its transcript",
    "",
    "Usage:",
    "  claimtrace verify --report <report.md> --transcript <session.jsonl> [--format table|json]",
    "  claimtrace extract --report <report.md>",
    "  claimtrace formats",
    "",
    "Exit codes: 0 = every claim VERIFIED; 1 = any claim UNVERIFIED or",
    "CONTRADICTED; 2 = usage error, missing file, or unparseable input.",
  ].join("\n");
}

function fail(message: string): never {
  console.error(`claimtrace: ${message}`);
  process.exit(2);
}

function readOrFail(path: string, label: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    fail(`${label} not found or unreadable: ${path}`);
  }
}

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(`missing value for --${key}`);
      }
      flags.set(key, value);
      i++;
    } else {
      fail(`unexpected argument: ${a}`);
    }
  }
  return flags;
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === undefined || cmd === "--help" || cmd === "-h") {
    console.log(usage());
    return;
  }
  if (cmd === "--version" || cmd === "-V") {
    console.log(`claimtrace ${VERSION}`);
    return;
  }

  if (cmd === "formats") {
    if (rest.length > 0) fail("formats takes no arguments");
    console.log(renderFormats());
    return;
  }

  if (cmd === "extract") {
    const flags = parseFlags(rest);
    const reportPath = flags.get("report");
    if (!reportPath) fail("extract requires --report <report.md>");
    if (flags.size > 1) fail("extract takes only --report");
    const report = readOrFail(reportPath, "report");
    const { claims, unparsed } = extractClaims(report);
    console.log(renderExtract(claims, unparsed));
    return;
  }

  if (cmd === "verify") {
    const flags = parseFlags(rest);
    const reportPath = flags.get("report");
    const transcriptPath = flags.get("transcript");
    const format = flags.get("format") ?? "table";
    if (!reportPath) fail("verify requires --report <report.md>");
    if (!transcriptPath) fail("verify requires --transcript <session.jsonl>");
    if (format !== "table" && format !== "json") {
      fail(`--format must be table or json, got: ${format}`);
    }
    for (const k of flags.keys()) {
      if (!["report", "transcript", "format"].includes(k)) fail(`unknown flag: --${k}`);
    }
    const report = readOrFail(reportPath, "report");
    const transcriptText = readOrFail(transcriptPath, "transcript");
    const { claims, unparsed } = extractClaims(report);
    if (claims.length === 0) {
      fail("no claims found in report — nothing to verify (unparseable input?)");
    }
    const transcript = parseTranscript(transcriptText);
    if (transcript.events.length === 0 && transcript.totalLines === 0) {
      fail("transcript has no parseable lines (unparseable input?)");
    }
    const verification = verifyClaims(claims, transcript);
    if (format === "json") {
      console.log(renderJson(verification, reportPath, transcriptPath, unparsed));
    } else {
      console.log(renderTable(verification, reportPath, transcriptPath));
      if (unparsed.length > 0) {
        console.log(`\nnote: ${unparsed.length} claim-like line(s) could not be parsed — see \`claimtrace extract\`:`);
        for (const u of unparsed) console.log(`  UNPARSED: ${u}`);
      }
    }
    process.exitCode = exitCode(verification);
    return;
  }

  fail(`unknown command: ${cmd}\n${usage()}`);
}

main();
