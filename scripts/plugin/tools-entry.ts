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
  const argv = [...(tool.prefix ?? []), ...args];
  process.argv.splice(2, process.argv.length, ...argv);
  Bun.argv.splice(2, Bun.argv.length, ...argv);
  const mod = await LOADERS[tool.source]();
  process.exit(await mod.main());
}
