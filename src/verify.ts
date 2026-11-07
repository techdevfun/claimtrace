/**
 * Verification: each claim from the report against the transcript evidence.
 *
 * Rules (deterministic, fail-closed):
 *  - file-opened: VERIFIED iff a read event names the exact path.
 *  - test-run "all N pass": VERIFIED iff the last test run's output shows
 *    N passing and 0 failing; CONTRADICTED iff it shows other counts.
 *  - test-run "ran <cmd>": VERIFIED iff the command appears in the transcript.
 *  - defect-fixed (per file): VERIFIED iff an edit event touches the file.
 *  - defect-fixed (count N): VERIFIED iff the transcript holds >= N edits.
 *  - coverage "all N files": VERIFIED iff every file the report names was
 *    opened AND the report names all N; otherwise lists what is missing.
 *  - truncated transcript: every claim UNVERIFIED (fail-closed).
 *
 * Output never contains transcript contents — only claim text, counts
 * parsed from test output, and "transcript:<line>" pointers.
 */
import type { Claim, Transcript, VerdictRow } from "./types.js";
import { lastTestRun, normalizePath, openedFiles, parseTestCounts } from "./transcript.js";

export interface Verification {
  rows: VerdictRow[];
  summary: { verified: number; unverified: number; contradicted: number };
  truncated: boolean;
}

function editCount(t: Transcript): number {
  return t.events.filter((e) => e.kind === "edit").length;
}

function commandLine(t: Transcript, command: string): number | undefined {
  const want = command.trim().toLowerCase();
  // One direction only: the transcript command must contain the claimed
  // command. The reverse (claim is a superstring of what ran) must NOT
  // match — claiming "npm test --watch" when only "npm test" ran is a
  // false positive in a verification tool.
  const hit = t.events.find(
    (e) => e.kind === "command" && e.command !== undefined && e.command.toLowerCase().includes(want),
  );
  return hit?.line;
}

export function verifyClaims(claims: Claim[], t: Transcript): Verification {
  const rows: VerdictRow[] = [];
  const opened = openedFiles(t);
  const edits = editCount(t);

  for (const claim of claims) {
    if (t.truncated) {
      rows.push({
        claim: claim.text,
        type: claim.type,
        verdict: "UNVERIFIED",
        evidence: `transcript:${t.truncatedAt ?? "?"}`,
        detail: `transcript truncated at line ${t.truncatedAt ?? "?"} — fail-closed, nothing verified`,
      });
      continue;
    }

    switch (claim.type) {
      case "file-opened": {
        const file = normalizePath(claim.file ?? "");
        const hit = t.events.find((e) => e.kind === "read" && e.file === file);
        rows.push({
          claim: claim.text,
          type: claim.type,
          verdict: hit ? "VERIFIED" : "UNVERIFIED",
          evidence: hit ? `transcript:${hit.line}` : "-",
          detail: hit ? `read at transcript:${hit.line}` : `no read of ${file} in transcript`,
        });
        break;
      }

      case "test-run": {
        if (claim.command) {
          const line = commandLine(t, claim.command);
          rows.push({
            claim: claim.text,
            type: claim.type,
            verdict: line !== undefined ? "VERIFIED" : "UNVERIFIED",
            evidence: line !== undefined ? `transcript:${line}` : "-",
            detail:
              line !== undefined
                ? `command ran at transcript:${line}`
                : `no run of "${claim.command}" in transcript`,
          });
          break;
        }
        const run = lastTestRun(t);
        if (!run || run.output === undefined) {
          rows.push({
            claim: claim.text,
            type: claim.type,
            verdict: "UNVERIFIED",
            evidence: "-",
            detail: "no test run with captured output in transcript",
          });
          break;
        }
        const counts = parseTestCounts(run.output);
        if (counts === null) {
          rows.push({
            claim: claim.text,
            type: claim.type,
            verdict: "UNVERIFIED",
            evidence: `transcript:${run.line}`,
            detail: "test output has no parseable pass/fail counts",
          });
          break;
        }
        const wantPass = claim.passing ?? claim.count ?? 0;
        const wantTotal = claim.count ?? wantPass;
        const ok = counts.passing === wantPass && counts.passing + counts.failing === wantTotal;
        rows.push({
          claim: claim.text,
          type: claim.type,
          verdict: ok ? "VERIFIED" : "CONTRADICTED",
          evidence: `transcript:${run.line}`,
          detail: ok
            ? `output shows ${counts.passing} passing, ${counts.failing} failing`
            : `output shows ${counts.passing} passing, ${counts.failing} failing — claimed ${wantPass} of ${wantTotal} pass`,
        });
        break;
      }

      case "defect-fixed": {
        if (claim.file) {
          const file = normalizePath(claim.file);
          const hit = t.events.find((e) => e.kind === "edit" && e.file === file);
          rows.push({
            claim: claim.text,
            type: claim.type,
            verdict: hit ? "VERIFIED" : "UNVERIFIED",
            evidence: hit ? `transcript:${hit.line}` : "-",
            detail: hit ? `edit at transcript:${hit.line}` : `no edit touching ${file} in transcript`,
          });
          break;
        }
        const n = claim.count ?? 0;
        rows.push({
          claim: claim.text,
          type: claim.type,
          verdict: edits >= n ? "VERIFIED" : "UNVERIFIED",
          evidence: "-",
          detail:
            edits >= n
              ? `${edits} edit(s) in transcript, claimed ${n} defect(s) fixed`
              : `only ${edits} edit(s) in transcript, claimed ${n} defect(s) fixed`,
        });
        break;
      }

      case "coverage": {
        const n = claim.count ?? 0;
        const named = claims
          .filter((c) => c.type === "file-opened" && c.file)
          .map((c) => normalizePath(c.file as string));
        const missing = named.filter((f) => !opened.has(f));
        if (missing.length > 0) {
          rows.push({
            claim: claim.text,
            type: claim.type,
            verdict: "UNVERIFIED",
            evidence: "-",
            detail: `unopened: ${missing.join(", ")}`,
          });
        } else if (named.length < n) {
          rows.push({
            claim: claim.text,
            type: claim.type,
            verdict: "UNVERIFIED",
            evidence: "-",
            detail: `report names only ${named.length} of ${n} files — the rest cannot be checked`,
          });
        } else {
          rows.push({
            claim: claim.text,
            type: claim.type,
            verdict: "VERIFIED",
            evidence: "-",
            detail: `${n} files named and all opened`,
          });
        }
        break;
      }
    }
  }

  const summary = {
    verified: rows.filter((r) => r.verdict === "VERIFIED").length,
    unverified: rows.filter((r) => r.verdict === "UNVERIFIED").length,
    contradicted: rows.filter((r) => r.verdict === "CONTRADICTED").length,
  };
  return { rows, summary, truncated: t.truncated };
}

/** Exit code: 0 = every claim VERIFIED, 1 = any UNVERIFIED/CONTRADICTED. */
export function exitCode(v: Verification): number {
  return v.summary.unverified + v.summary.contradicted > 0 ? 1 : 0;
}
