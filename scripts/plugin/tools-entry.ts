#!/usr/bin/env bun
/**
 * Bundle entry for dist/tools.js: every tool in src/jobsearch/toolmap.ts in one
 * file, so shared modules ship once. `bun dist/tools.js <tool> [args…]` sets
 * argv as if the tool's own script had been run, then calls its main().
 * The import map below must list exactly the toolmap's sources
 * (tests/plugin-bundle.test.ts checks it).
 */
import { TOOL_MAP } from "../../src/jobsearch/toolmap.js";

type Main = () => number | Promise<number>;
export const LOADERS: Record<string, () => Promise<{ main: Main }>> = {
  "scripts/generate/application.ts": () => import("../generate/application.js"),
  "scripts/reevaluate.ts": () => import("../reevaluate.js"),
  "scripts/pipeline/cli.ts": () => import("../pipeline/cli.js"),
  "scripts/markets.ts": () => import("../markets.js"),
  "scripts/jobs/summarize.ts": () => import("../jobs/summarize.js"),
  "scripts/match/score-job.ts": () => import("../match/score-job.js"),
  "scripts/select-template.ts": () => import("../select-template.js"),
  "scripts/naming.ts": () => import("../naming.js"),
  "scripts/followup.ts": () => import("../followup.js"),
  "scripts/jobs/interview-prep.ts": () => import("../jobs/interview-prep.js"),
  "scripts/profile/outcome.ts": () => import("../profile/outcome.js"),
  "scripts/profile/reason.ts": () => import("../profile/reason.js"),
  "scripts/profile/feedback.ts": () => import("../profile/feedback.js"),
  "scripts/profile/scaffold.ts": () => import("../profile/scaffold.js"),
  "scripts/projects.ts": () => import("../projects.js"),
  "scripts/jobs/market.ts": () => import("../jobs/market.js"),
  "scripts/jobs/trajectory.ts": () => import("../jobs/trajectory.js"),
  "scripts/jobs/alerts.ts": () => import("../jobs/alerts.js"),
  "scripts/generate/email.ts": () => import("../generate/email.js"),
  "scripts/generate/cover-letter.ts": () => import("../generate/cover-letter.js"),
  "scripts/dashboard.ts": () => import("../dashboard.js"),
  "scripts/doctor.ts": () => import("../doctor.js"),
};

if (import.meta.main) {
  const [name, ...args] = process.argv.slice(2);
  const tool = name ? TOOL_MAP[name] : undefined;
  if (!tool) {
    process.stderr.write(JSON.stringify({ error: `unknown tool ${JSON.stringify(name)}`, code: "BAD_ARGS", tools: Object.keys(TOOL_MAP) }) + "\n");
    process.exit(2);
  }
  const unknown = unknownFlag(args, tool.flags, tool.short);
  if (unknown) {
    process.stderr.write(JSON.stringify({
      error: `${name}: Unknown option '${unknown}'`,
      code: "BAD_ARGS",
      hint: `run \`jobsearch run ${name} --help\` for the supported flags`,
    }) + "\n");
    process.exit(2);
  }
  const argv = [...(tool.prefix ?? []), ...args];
  process.argv.splice(2, process.argv.length, ...argv);
  Bun.argv.splice(2, Bun.argv.length, ...argv);
  const mod = await LOADERS[tool.source]();
  process.exit(await runMain(name, mod.main));
}

/**
 * A rejected flag is a usage error, reported as the JSON error every tool
 * documents, not as an uncaught Bun stack trace (jobsearch-plugin#16).
 */
/**
 * The first argument that is not a flag the tool declares, or null. Arguments
 * after a bare `--` are positional. A value that happens to start with `--`
 * must be passed as `--flag=value`.
 */
export function unknownFlag(args: string[], flags: readonly string[], short: readonly string[] = []): string | null {
  for (const arg of args) {
    if (arg === "--") return null;
    if (arg.startsWith("--")) {
      const flag = arg.slice(2).split("=")[0];
      if (flag !== "help" && !flags.includes(flag)) return arg;
    } else if (/^-[A-Za-z]$/.test(arg) && arg !== "-h" && !short.includes(arg.slice(1))) {
      return arg;
    }
  }
  return null;
}

export async function runMain(name: string, main: Main): Promise<number> {
  // Tools report usage errors as {"code":"BAD_ARGS"|"BAD_CMD"} but most exit 1;
  // the contract's usage exit is 2 (jobsearch-plugin#17).
  let usage = false;
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    if (/"code":"(BAD_ARGS|BAD_CMD)"/.test(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk))) usage = true;
    return (write as (...a: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stderr.write;
  try {
    const code = await main();
    return usage && code === 1 ? 2 : code;
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    if (typeof code === "string" && code.startsWith("ERR_PARSE_ARGS")) {
      process.stderr.write(JSON.stringify({
        error: `${name}: ${(err as Error).message}`,
        code: "BAD_ARGS",
        hint: `run \`jobsearch run ${name} --help\` for the supported flags`,
      }) + "\n");
      return 2;
    }
    throw err;
  }
}
