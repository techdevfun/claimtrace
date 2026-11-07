/**
 * Transcript parsing: JSONL session logs from Claude Code, Codex, OpenCode,
 * or a generic {"tool": ..., ...} JSONL shape.
 *
 * The parser is deterministic and fail-closed: any line that is not valid
 * JSON marks the transcript truncated, and verification then refuses to
 * VERIFY anything from it (see verify.ts).
 *
 * Only the shape of each event is kept (tool name, file path, command,
 * captured output, exit code). Transcript contents are never printed by
 * the CLI — output carries claim text and "transcript:<line>" pointers only.
 */
import type { TestCounts, Transcript, TranscriptEvent } from "./types.js";

const READ_TOOLS = new Set(["read", "view", "open", "notebookread", "cat"]);
const EDIT_TOOLS = new Set(["edit", "write", "notebookedit", "apply_patch", "create"]);
const COMMAND_TOOLS = new Set(["bash", "exec", "run", "shell", "terminal"]);

/** Normalize a file path for comparison: strip leading ./ and trailing punctuation. */
export function normalizePath(p: string): string {
  return p.replace(/^\.\//, "").replace(/[.,;:)\]]+$/, "");
}

/** Parse "43 passing / 2 failing" style counts out of captured test output. */
export function parseTestCounts(output: string): TestCounts | null {
  const passing = output.match(/(\d+)\s+passing\b/i) ?? output.match(/(\d+)\s+passed\b/i);
  const failing = output.match(/(\d+)\s+failing\b/i) ?? output.match(/(\d+)\s+failed\b/i);
  const ratio = output.match(/(\d+)\s*\/\s*(\d+)\s+tests?\s+pass/i);
  if (ratio) {
    const pass = Number(ratio[1]);
    const total = Number(ratio[2]);
    return { passing: pass, failing: total - pass };
  }
  const summary = output.match(/tests:\s*(\d+)\s+passed,\s*(\d+)\s+failed/i);
  if (summary) {
    return { passing: Number(summary[1]), failing: Number(summary[2]) };
  }
  if (passing && failing) {
    return { passing: Number(passing[1]), failing: Number(failing[1]) };
  }
  if (passing && /0\s+fail/i.test(output)) {
    return { passing: Number(passing[1]), failing: 0 };
  }
  if (passing) {
    return { passing: Number(passing[1]), failing: 0 };
  }
  return null;
}

interface PendingToolUse {
  line: number;
  name: string;
  input: Record<string, unknown>;
}

function stringField(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

/** Extract the file path from a tool input object (several key spellings exist). */
function inputFile(input: Record<string, unknown>): string | undefined {
  return stringField(input, "file_path", "file", "path", "filepath");
}

export function parseTranscript(text: string): Transcript {
  const rawLines = text.split("\n");
  const events: TranscriptEvent[] = [];
  const pending = new Map<string, PendingToolUse>();
  let truncated = false;
  let truncatedAt: number | undefined;
  let format = "generic-jsonl";
  let totalLines = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (raw.trim() === "") continue;
    totalLines = i + 1;
    const lineNo = i + 1;
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      // A cut line means the log is incomplete: fail-closed from here on.
      truncated = true;
      truncatedAt = lineNo;
      break;
    }
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
      truncated = true;
      truncatedAt = lineNo;
      break;
    }
    const rec = obj as Record<string, unknown>;
    if (rec.truncated === true) {
      truncated = true;
      truncatedAt = lineNo;
      continue;
    }

    // --- Claude Code session shape ---------------------------------------
    // {"type":"assistant","message":{"content":[{"type":"tool_use","id","name","input"}]}}
    // {"type":"user","message":{"content":[{"type":"tool_result","tool_use_id","content"}]}}
    const msg = rec.message as Record<string, unknown> | undefined;
    const content = msg?.content;
    if (typeof rec.type === "string" && Array.isArray(content)) {
      format = "claude-code-session";
      for (const item of content) {
        if (item === null || typeof item !== "object") continue;
        const c = item as Record<string, unknown>;
        if (c.type === "tool_use" && typeof c.name === "string") {
          const name = (c.name as string).toLowerCase();
          const input = (c.input ?? {}) as Record<string, unknown>;
          const id = typeof c.id === "string" ? c.id : "";
          if (id) pending.set(id, { line: lineNo, name, input });
          if (READ_TOOLS.has(name)) {
            const file = inputFile(input);
            if (file) events.push({ line: lineNo, kind: "read", file: normalizePath(file) });
          } else if (EDIT_TOOLS.has(name)) {
            const file = inputFile(input);
            if (file) events.push({ line: lineNo, kind: "edit", file: normalizePath(file) });
          } else if (COMMAND_TOOLS.has(name)) {
            const command = stringField(input, "command", "cmd");
            if (command) {
              events.push({ line: lineNo, kind: "command", command });
            }
          }
        } else if (c.type === "tool_result" && typeof c.tool_use_id === "string") {
          const use = pending.get(c.tool_use_id);
          if (use && COMMAND_TOOLS.has(use.name)) {
            const out = typeof c.content === "string" ? c.content : "";
            const ev = events.find(
              (e) => e.kind === "command" && e.line === use.line && e.command !== undefined,
            );
            if (ev) {
              ev.output = out;
              if (typeof c.exit_code === "number") ev.exitCode = c.exit_code;
            }
          }
        } else if (c.type === "text" && typeof c.text === "string") {
          events.push({ line: lineNo, kind: "message", text: c.text });
        }
      }
      continue;
    }

    // --- Generic / Codex-style shape --------------------------------------
    // {"tool":"Read","file":"src/a.ts"} | {"tool":"Bash","command":"npm test","output":"..."}
    // {"final_message":"..."} | {"type":"result","result":"..."}
    if (typeof rec.tool === "string") {
      const name = rec.tool.toLowerCase();
      if (READ_TOOLS.has(name)) {
        const file = stringField(rec, "file", "file_path", "path");
        if (file) events.push({ line: lineNo, kind: "read", file: normalizePath(file) });
      } else if (EDIT_TOOLS.has(name)) {
        const file = stringField(rec, "file", "file_path", "path");
        if (file) events.push({ line: lineNo, kind: "edit", file: normalizePath(file) });
      } else if (COMMAND_TOOLS.has(name)) {
        const command = stringField(rec, "command", "cmd");
        if (command) {
          events.push({
            line: lineNo,
            kind: "command",
            command,
            output: typeof rec.output === "string" ? rec.output : undefined,
            exitCode: typeof rec.exit_code === "number" ? rec.exit_code : undefined,
          });
        }
      }
      continue;
    }
    if (typeof rec.final_message === "string") {
      events.push({ line: lineNo, kind: "message", text: rec.final_message });
      continue;
    }
    if (rec.type === "result" && typeof rec.result === "string") {
      events.push({ line: lineNo, kind: "message", text: rec.result });
      continue;
    }
    // Any other JSON object line is a well-formed but unrecognized event:
    // it counts as parseable, it just carries no evidence.
  }

  return { events, truncated, truncatedAt, format, totalLines };
}

/** Files opened anywhere in the transcript, as a set of normalized paths. */
export function openedFiles(t: Transcript): Set<string> {
  const out = new Set<string>();
  for (const e of t.events) if (e.kind === "read" && e.file) out.add(e.file);
  return out;
}

/** The most recent command event whose captured output parses as test counts. */
export function lastTestRun(t: Transcript): TranscriptEvent | undefined {
  let found: TranscriptEvent | undefined;
  for (const e of t.events) {
    if (e.kind === "command" && e.output !== undefined && parseTestCounts(e.output) !== null) {
      found = e;
    }
  }
  return found;
}
