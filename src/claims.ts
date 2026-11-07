/**
 * Claim extraction from an agent's report (Markdown).
 *
 * Deterministic patterns only — no model, no heuristics beyond the regexes
 * below. Every claim keeps the exact report text it came from, so `extract`
 * shows the user what the parser saw. Sentences that look like claims but
 * match no pattern are reported as UNPARSED, never silently counted.
 */
import type { Claim } from "./types.js";

export interface Extraction {
  claims: Claim[];
  /** Claim-like sentences that matched no pattern (shown, never verified). */
  unparsed: string[];
}

const FILE_PATH = "[A-Za-z0-9_][A-Za-z0-9_./-]*\\.[A-Za-z0-9]{1,10}";

const CLAIM_KEYWORDS =
  /\b(review\w*|read|open\w*|inspect\w*|check\w*|fix\w*|test\w*|pass\w*|defect\w*|all \d+ files)\b/i;

/** Split report text into sentences for the UNPARSED scan. */
function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.replace(/^[-*•\s]+/, "").trim())
    .filter((s) => s.length > 0);
}

export function extractClaims(report: string): Extraction {
  const claims: Claim[] = [];
  const seen = new Set<string>();
  const push = (c: Claim) => {
    // Dedup on the claim's identity, not its wording: the same defect or
    // file phrased two ways ("`src/a.ts`" vs "src/a.ts") is one claim.
    const key =
      c.type === "file-opened" || (c.type === "defect-fixed" && c.file)
        ? `${c.type}|file:${c.file}`
        : c.type === "test-run" && c.command
          ? `${c.type}|cmd:${c.command}`
          : `${c.type}|${c.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    claims.push(c);
  };

  // 1. Coverage: "reviewed all 12 files" / "read every file in scope".
  for (const m of report.matchAll(
    /\b(?:reviewed|read|checked|inspected)\s+(?:all|every)\s+(\d+)\s+files?\b/gi,
  )) {
    push({ type: "coverage", text: m[0], count: Number(m[1]) });
  }

  // 2. Test-run: "all 45 tests pass".
  for (const m of report.matchAll(/\ball\s+(\d+)\s+tests?\s+pass(?:ing|ed)?\b/gi)) {
    push({ type: "test-run", text: m[0], count: Number(m[1]) });
  }
  // 3. Test-run: "43 of 45 tests pass" / "43/45 tests pass".
  for (const m of report.matchAll(
    /(\d+)\s*(?:of|\/)\s*(\d+)\s+tests?\s+pass(?:ing|ed)?\b/gi,
  )) {
    push({
      type: "test-run",
      text: m[0],
      passing: Number(m[1]),
      count: Number(m[2]),
    });
  }
  // 4. Test-run: "ran `npm test`" / "ran npm test".
  for (const m of report.matchAll(/\bran\s+`([^`]+)`/gi)) {
    push({ type: "test-run", text: m[0], command: m[1].trim() });
  }
  for (const m of report.matchAll(/\bran\s+([a-z][\w\s./-]*?test[\w\s./-]*?)(?=[.!?,]|$)/gim)) {
    if (m[1].includes("`")) continue;
    push({ type: "test-run", text: m[0].trim(), command: m[1].trim() });
  }

  // 5. Defect-fixed, count form: "fixed 3 defects".
  for (const m of report.matchAll(/\bfixed\s+(\d+)\s+defects?\b/gi)) {
    push({ type: "defect-fixed", text: m[0], count: Number(m[1]) });
  }
  // 6. Defect-fixed, per-file form: "Fixed defect 1 in `src/auth.ts` ..."
  //    or "Fixed `src/auth.ts` (null-check bug)".
  for (const m of report.matchAll(
    /\bfixed\b[^.\n]*?`([^`]+)`/gi,
  )) {
    const file = m[1];
    if (!/\.[A-Za-z0-9]{1,10}$/.test(file)) continue;
    push({ type: "defect-fixed", text: m[0], file });
  }
  for (const m of report.matchAll(
    new RegExp(`\\bfixed\\b[^.\\n]*?\\bin\\s+(${FILE_PATH})`, "gi"),
  )) {
    push({ type: "defect-fixed", text: m[0], file: m[1] });
  }

  // 7. File-opened: "Reviewed `src/auth.ts`." / "Opened src/auth.ts".
  for (const m of report.matchAll(
    /\b(?:reviewed|opened|read|inspected|checked)\s+(?:the\s+)?(?:file\s+)?`([^`]+)`/gi,
  )) {
    const file = m[1];
    if (!/\.[A-Za-z0-9]{1,10}$/.test(file)) continue;
    push({ type: "file-opened", text: m[0], file });
  }
  for (const m of report.matchAll(
    new RegExp(`\\b(?:reviewed|opened|read|inspected|checked)\\s+(?:the\\s+)?(?:file\\s+)?(${FILE_PATH})`, "gi"),
  )) {
    push({ type: "file-opened", text: m[0], file: m[1] });
  }

  // UNPARSED: claim-like sentences no claim was extracted from.
  const unparsed: string[] = [];
  for (const s of sentences(report)) {
    if (!CLAIM_KEYWORDS.test(s)) continue;
    if (s.startsWith("#")) continue;
    const covered = claims.some((c) => s.includes(c.text));
    if (!covered) unparsed.push(s.length > 120 ? s.slice(0, 117) + "..." : s);
  }

  return { claims, unparsed };
}
