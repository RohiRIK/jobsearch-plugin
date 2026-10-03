/**
 * Delegation to the existing single-purpose CLIs.
 *
 * `jobsearch` does not re-implement the application pipeline, the reevaluate
 * gate or the scraper: it runs them as child processes, parses their JSON, and
 * re-emits the result in the shared envelope. One implementation, two
 * front-ends. In a bundled plugin the same tools ship as `dist/tools/<name>.js`;
 * in a checkout they run from source.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CODE_ROOT, WORKSPACE } from "../paths.js";
import { AgentError, type ErrorType } from "./contract.js";
import { TOOL_MAP } from "./toolmap.js";

export type ToolName = keyof typeof TOOL_MAP & string;

/**
 * argv for running a tool: the bundled multi-tool (`dist/tools.js <name>`) in
 * an installed plugin, the tool's own source file in a checkout.
 */
export function toolCommand(name: string, args: string[], root: string = CODE_ROOT): string[] {
  const tool = TOOL_MAP[name];
  if (!tool) throw new AgentError("usage", `unknown tool ${JSON.stringify(name)}`, [`one of: ${Object.keys(TOOL_MAP).join(", ")}`]);
  const bundled = join(root, "dist", "tools.js");
  if (existsSync(bundled)) return [process.execPath, bundled, name, ...args];
  // In a checkout, go through the same entry the bundle uses so both report
  // errors identically.
  const entry = join(root, "scripts", "plugin", "tools-entry.ts");
  if (existsSync(entry) && existsSync(join(root, tool.source))) return [process.execPath, entry, name, ...args];
  throw new AgentError("unavailable", `tool '${name}' is not present in ${root}`, ["reinstall the plugin, or run from a checkout"]);
}

/** Environment every child inherits so it resolves the same code root and workspace. */
export function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    JOB_SEARCH_PLUGIN_ROOT: CODE_ROOT,
    JOB_SEARCH_HOME: WORKSPACE,
    ...extra,
  };
}

export interface ToolRun {
  code: number;
  json: unknown;
  stdout: string;
  stderr: string;
}

export async function runTool(name: string, args: string[], options: { timeoutMs?: number; stdin?: string } = {}): Promise<ToolRun> {
  const proc = Bun.spawn(toolCommand(name, args), {
    cwd: process.cwd(),
    env: childEnv(),
    stdin: options.stdin === undefined ? "ignore" : new TextEncoder().encode(options.stdin),
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeoutMs ?? 120_000,
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  return { code, json: lastJson(stdout), stdout, stderr };
}

/**
 * The tool's result document. Most tools print exactly one JSON document; the
 * pipeline prints NDJSON progress lines first and its result last, so fall
 * back to the last top-level document (a pretty `{` at column 0, or the last
 * single-line object).
 */
export function lastJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    /* several documents */
  }
  const lines = trimmed.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] !== "{" && !lines[i].startsWith("{")) continue;
    try {
      return JSON.parse(lines.slice(i).join("\n"));
    } catch {
      /* keep looking upward */
    }
  }
  return undefined;
}

const CODE_MAP: Record<string, ErrorType> = {
  BAD_ARGS: "usage",
  NO_QUERY: "usage",
  BAD_PORTAL: "validation",
  BAD_LAYOUT: "validation",
  BAD_TEMPLATE: "validation",
  LANGUAGE_CHOICE_REQUIRED: "validation",
  LAYOUT_CHOICE_REQUIRED: "validation",
  EMPTY_JOB: "validation",
  NO_INPUT: "usage",
  NOT_FOUND: "not_found",
  NO_PROFILE: "not_found",
  BAD_PROFILE: "validation",
  MISSING_PROFILE_FACTS: "validation",
  OUTPUT_EXISTS: "conflict",
};

/** The last JSON object a tool wrote to stderr — the existing CLIs' error convention. */
export function stderrError(stderr: string): { error?: string; code?: string; details?: unknown } | null {
  const lines = stderr.trim().split("\n").reverse();
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(t) as { error?: string; code?: string; details?: unknown };
      if (parsed.error) return parsed;
    } catch {
      /* not JSON */
    }
  }
  return null;
}

/** Turn a failed tool run (no usable stdout) into a typed AgentError. */
export function toolFailure(name: string, run: ToolRun): AgentError {
  if (run.code === null || run.code === 143 || run.code === 137) {
    return new AgentError("external", `${name} timed out or was killed`);
  }
  const parsed = stderrError(run.stderr);
  if (parsed) {
    const type = (parsed.code && CODE_MAP[parsed.code]) || "validation";
    return new AgentError(type, parsed.error ?? `${name} failed`, [], true, parsed.details ?? (parsed.code ? { code: parsed.code } : undefined));
  }
  const tail = (run.stderr || run.stdout).trim().split("\n").slice(-3).join(" | ");
  // Fail open: an unexplained failure is internal, never reinterpreted as a verdict.
  return new AgentError("internal", `${name} exited ${run.code}${tail ? `: ${tail}` : ""}`, [], false);
}
