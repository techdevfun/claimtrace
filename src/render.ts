/** Table and JSON rendering for verify / extract output. */
import type { Claim } from "./types.js";
import type { Verification } from "./verify.js";

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 3) + "..." : s;
}

export function renderTable(v: Verification, reportPath: string, transcriptPath: string): string {
  const lines: string[] = [];
  lines.push(`claimtrace verify — ${reportPath} vs ${transcriptPath}`);
  if (v.truncated) {
    lines.push("WARNING: transcript is truncated — fail-closed, nothing verified.");
  }
  lines.push("");
  lines.push(
    `${pad("CLAIM", 44)} ${pad("TYPE", 12)} ${pad("VERDICT", 12)} ${pad("EVIDENCE", 16)} DETAIL`,
  );
  lines.push("-".repeat(110));
  for (const r of v.rows) {
    lines.push(
      `${pad(truncate(r.claim, 44), 44)} ${pad(r.type, 12)} ${pad(r.verdict, 12)} ${pad(r.evidence, 16)} ${r.detail}`,
    );
  }
  lines.push("-".repeat(110));
  const s = v.summary;
  lines.push(
    `${s.verified} VERIFIED, ${s.unverified} UNVERIFIED, ${s.contradicted} CONTRADICTED — ` +
      (s.unverified + s.contradicted > 0 ? "exit 1" : "all claims verified — exit 0"),
  );
  return lines.join("\n");
}

export function renderJson(
  v: Verification,
  reportPath: string,
  transcriptPath: string,
  unparsed: string[],
): string {
  return JSON.stringify(
    {
      report: reportPath,
      transcript: transcriptPath,
      truncated: v.truncated,
      claims: v.rows,
      unparsed,
      summary: v.summary,
    },
    null,
    2,
  );
}

export function renderExtract(claims: Claim[], unparsed: string[]): string {
  const lines: string[] = [];
  lines.push(`claims found: ${claims.length}`);
  for (const c of claims) {
    const extra =
      c.file !== undefined
        ? ` file=${c.file}`
        : c.command !== undefined
          ? ` command=${c.command}`
          : c.count !== undefined
            ? ` count=${c.count}`
            : "";
    lines.push(`- [${c.type}] ${c.text}${extra}`);
  }
  if (unparsed.length > 0) {
    lines.push(`unparsed claim-like lines: ${unparsed.length}`);
    for (const u of unparsed) lines.push(`- [UNPARSED] ${u}`);
  }
  return lines.join("\n");
}

export function renderFormats(): string {
  return [
    "supported transcript formats:",
    "",
    "  claude-code-session  Claude Code session JSONL: assistant messages with",
    "                       tool_use blocks (Read/Edit/Bash) and tool_result",
    "                       outputs. Detected by message.content arrays.",
    "  codex-exec-json      Codex `exec --json` output: JSON lines with a tool",
    "                       field (Bash/Read/Edit) plus command and output.",
    "                       Detected by the tool field on a JSON line.",
    "  opencode-session     OpenCode session JSONL: same generic tool lines as",
    "                       codex-exec-json (tool/command/output/file).",
    "  generic-jsonl        Any JSONL with {\"tool\", \"file\"|\"command\",",
    "                       \"output\"} lines, or {\"final_message\": \"...\"}.",
    "                       This is the fallback format.",
    "",
    "Detection is by line shape, in the order above. A line that is not",
    "valid JSON marks the transcript truncated: verification then fails",
    "closed (every claim UNVERIFIED) instead of guessing.",
  ].join("\n");
}
