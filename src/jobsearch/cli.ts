/**
 * `jobsearch` — the agent-first entrypoint, built to the CreateCLI-Agent
 * contract:
 *
 *   stdout   one compact JSON envelope ({"ok":true,"data":…} | {"ok":false,"error":…}),
 *            or NDJSON for `rank`. stderr is diagnostics only.
 *   exits    0 ok · 1 negative verdict · 2 usage · 3 not found · 5 conflict ·
 *            10 dry-run · 20 external/unavailable · 30 internal
 *   writes   need --yes; --dry-run previews and exits 10. Never prompts.
 *
 * `--help-json` lists every command and flag from the same table the MCP
 * server is generated from.
 */
import { parseArgs } from "node:util";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { WORKSPACE } from "../paths.js";
import {
  AgentError,
  CONTRACT_VERSION,
  EXIT,
  EXIT_TABLE,
  errorEnvelope,
  projectFields,
  toAgentError,
  type CommandSpec,
  type FlagSpec,
  type Values,
} from "./contract.js";
import { COMMANDS } from "./registry.js";
import { TOOL_MAP } from "./toolmap.js";
import { childEnv, toolCommand } from "./tools.js";

const COMMON_FLAGS: Record<string, FlagSpec> = {
  fields: { type: "string", description: "Comma-separated top-level fields to keep (e.g. fit,next or fit.score)" },
  pretty: { type: "boolean", description: "Indent JSON (debug only)" },
  quiet: { type: "boolean", description: "Suppress stderr diagnostics" },
};

export function helpJson() {
  return {
    name: "jobsearch",
    contractVersion: CONTRACT_VERSION,
    invoke: "jobsearch <command> [--flags]",
    envelope: {
      success: { ok: true, data: {} },
      failure: { ok: false, error: { code: 2, type: "validation", message: "", recoverable: true, suggestions: [] } },
    },
    exits: EXIT_TABLE,
    run: {
      usage: "jobsearch run <tool> [args…] — passthrough to a single-purpose CLI; its own JSON output and exit codes. Equivalent to `bun run <tool> …` in a checkout.",
      tools: Object.fromEntries(Object.entries(TOOL_MAP).map(([name, t]) => [name, { summary: t.summary, writes: Boolean(t.writes) }])),
      writesRule: "tools with writes:true change user state immediately — get a human yes first",
    },
    commands: Object.fromEntries(
      Object.entries(COMMANDS).map(([name, spec]) => [
        name,
        { summary: spec.summary, mutation: spec.mutation, output: spec.output, flags: { ...spec.flags, ...COMMON_FLAGS } },
      ]),
    ),
  };
}

function helpText(): string {
  const lines = [
    "jobsearch — agent-first JSON entrypoint for the job-search toolchain",
    "",
    "Usage: jobsearch <command> [--flags]   (--help-json for the machine schema)",
    "",
  ];
  for (const [name, spec] of Object.entries(COMMANDS)) {
    lines.push(`  ${name.padEnd(16)} ${spec.summary}${spec.mutation ? "  [writes: --yes / --dry-run]" : ""}`);
  }
  lines.push(`  ${"run".padEnd(16)} run <tool> [args…]: passthrough to ${Object.keys(TOOL_MAP).length} single-purpose tools (see --help-json)`);
  lines.push("", "Global: --fields --pretty --quiet.", `Exits: ${Object.entries(EXIT_TABLE).map(([k, v]) => `${k} ${v.split(" ")[0]}`).join(", ")}.`);
  return lines.join("\n") + "\n";
}

/** Validate argv against a spec. Throws AgentError("usage"|"validation"). */
export function parseCommandArgs(command: string, spec: CommandSpec, argv: string[]): Values {
  let values: Values;
  try {
    const options = Object.fromEntries(
      Object.entries({ ...spec.flags, ...COMMON_FLAGS }).map(([name, f]) => [name, { type: f.type }]),
    ) as Record<string, { type: "string" | "boolean" }>;
    ({ values } = parseArgs({ args: argv, options, strict: true, allowPositionals: false }) as { values: Values });
  } catch (err) {
    throw new AgentError("usage", err instanceof Error ? err.message : String(err), ["jobsearch --help-json"]);
  }
  validateValues(command, spec, values);
  return values;
}

export function validateValues(command: string, spec: CommandSpec, values: Values): void {
  for (const [name, f] of Object.entries(spec.flags)) {
    const v = values[name];
    if (f.required && (v === undefined || v === "")) {
      throw new AgentError("usage", `missing required --${name}`, [`jobsearch ${command} --${name} <${f.description}>`]);
    }
    if (f.enum && typeof v === "string" && !f.enum.includes(v)) {
      throw new AgentError("validation", `--${name} must be one of ${f.enum.join(", ")}, got ${JSON.stringify(v)}`);
    }
    if (typeof v === "string" && /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) {
      throw new AgentError("validation", `--${name} contains control characters`);
    }
  }
}

/**
 * Local usage log: command, exit, duration, stdout bytes — never arguments,
 * which can carry company names. Feeds the manage skill's Audit workflow.
 * JOB_SEARCH_TELEMETRY=0 turns it off; failure to write is ignored.
 */
function logCall(command: string, exit: number, ms: number, bytes: number): void {
  if (process.env.JOB_SEARCH_TELEMETRY === "0") return;
  try {
    const path = join(WORKSPACE, "data", "state", "agent-calls.jsonl");
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), command, exit, ms, bytes }) + "\n");
  } catch {
    /* telemetry must never break a command */
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(helpText());
    return EXIT.ok;
  }
  let pretty = rest.includes("--pretty");
  const quiet = rest.includes("--quiet");
  let bytes = 0;
  const write = (value: unknown) => {
    const line = JSON.stringify(value, null, pretty ? 2 : undefined) + "\n";
    bytes += line.length;
    process.stdout.write(line);
  };
  if (command === "--help-json") {
    write(helpJson());
    return EXIT.ok;
  }
  if (command === "--version" || command === "version") {
    write({ ok: true, data: { contractVersion: CONTRACT_VERSION } });
    return EXIT.ok;
  }

  const started = performance.now();
  const finish = (exit: number) => {
    logCall(command, exit, Math.round(performance.now() - started), bytes);
    return exit;
  };

  if (command === "run") return finish(await runPassthrough(rest, write));

  const spec = COMMANDS[command];
  if (!spec) {
    const { envelope, exit } = errorEnvelope(new AgentError("usage", `unknown command ${JSON.stringify(command)}`, [`one of: ${Object.keys(COMMANDS).join(", ")}`, "jobsearch --help-json"]));
    write(envelope);
    return finish(exit);
  }

  try {
    const values = parseCommandArgs(command, spec, rest);
    pretty = values.pretty === true;
    if (spec.output === "stdio") {
      await spec.run(values);
      return EXIT.ok;
    }
    const result = await spec.run(values);
    if (spec.output === "ndjson" && result.rows) {
      for (const row of result.rows) write(row);
    } else {
      const fields = typeof values.fields === "string" ? values.fields.split(",").map((f) => f.trim()).filter(Boolean) : null;
      write({ ok: true, data: fields ? projectFields(result.data, fields) : result.data });
    }
    return finish(result.exit ?? EXIT.ok);
  } catch (err) {
    const agentError = toAgentError(err);
    if (agentError.type === "internal" && !quiet) process.stderr.write((err instanceof Error ? err.stack ?? err.message : String(err)) + "\n");
    const { envelope, exit } = errorEnvelope(agentError);
    write(envelope);
    return finish(exit);
  }
}

/** `jobsearch run <tool> …`: the tool owns stdout/stderr and the exit code. */
async function runPassthrough(rest: string[], write: (value: unknown) => void): Promise<number> {
  const [tool, ...args] = rest;
  let argv: string[];
  try {
    if (!tool) throw new AgentError("usage", "run needs a tool name", [`one of: ${Object.keys(TOOL_MAP).join(", ")}`]);
    argv = toolCommand(tool, args);
  } catch (err) {
    const { envelope, exit } = errorEnvelope(toAgentError(err));
    write(envelope);
    return exit;
  }
  const proc = Bun.spawn(argv, { cwd: process.cwd(), env: childEnv(), stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  return await proc.exited;
}
