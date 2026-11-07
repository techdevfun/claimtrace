/** Shared types for claimtrace. */

export type Verdict = "VERIFIED" | "UNVERIFIED" | "CONTRADICTED";

export type ClaimType = "file-opened" | "test-run" | "defect-fixed" | "coverage";

export interface Claim {
  /** Claim kind (see ClaimType). */
  type: ClaimType;
  /** The exact report text the claim was parsed from. */
  text: string;
  /** File path, for file-opened and per-file defect-fixed claims. */
  file?: string;
  /** Claimed count: N files (coverage), N tests (test-run), N defects (defect-fixed). */
  count?: number;
  /** Claimed passing count, for "N of M tests pass" claims. */
  passing?: number;
  /** Command the report says was run, for "ran <command>" claims. */
  command?: string;
}

export interface VerdictRow {
  claim: string;
  type: ClaimType;
  verdict: Verdict;
  /** Evidence pointer, "transcript:<line>" or "-" when there is none. */
  evidence: string;
  /** One-line reason, never transcript content. */
  detail: string;
}

export type TranscriptEventKind = "read" | "command" | "edit" | "message";

export interface TranscriptEvent {
  /** 1-based line number in the transcript file. */
  line: number;
  kind: TranscriptEventKind;
  /** File path, for read/edit events. */
  file?: string;
  /** Command text, for command events. */
  command?: string;
  /** Captured tool output, for command events (kept in memory only, never printed). */
  output?: string;
  /** Exit code of the command, when recorded. */
  exitCode?: number;
  /** Assistant/message text, for message events. */
  text?: string;
}

export interface Transcript {
  events: TranscriptEvent[];
  /** True when the log ends mid-line, has an unparseable line, or carries a truncated marker. */
  truncated: boolean;
  /** 1-based line where truncation was detected, when truncated. */
  truncatedAt?: number;
  /** Detected format name (see `claimtrace formats`). */
  format: string;
  totalLines: number;
}

export interface TestCounts {
  passing: number;
  failing: number;
}
