#!/usr/bin/env bun
/**
 * plugin:check — the plugin's own gate, run by `bun run gates` (pre-push):
 * committed bundle is fresh, every host manifest carries the same version, and
 * each carries its expected public name (PLUGIN_NAMES).
 * Emits one JSON envelope; exit 0 when every check passes.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CODE_ROOT as ROOT } from "../../src/paths.js";
import { sourceHash } from "./build.js";

const PLUGIN = join(ROOT, "job-search");
const read = (p: string) => JSON.parse(readFileSync(join(PLUGIN, p), "utf-8"));

/**
 * Public names. The Claude Code id is what existing installs are keyed by
 * (enabledPlugins["job-search@rohirik"], the /job-search:* skill prefix), so it
 * never changes; Hermes and OpenClaw use `jobsearch` because the Hermes catalog
 * key `job-search` belongs to an unrelated plugin (agent-data/job-search).
 */
export const PLUGIN_NAMES = { claude: "job-search", portable: "jobsearch", npm: "@rohirik/jobsearch" } as const;

export function runChecks(): Array<{ check: string; pass: boolean; detail: string; hint?: string }> {
  const checks: Array<{ check: string; pass: boolean; detail: string; hint?: string }> = [];
  const buildPath = join(PLUGIN, "dist", "BUILD.json");
  const built = existsSync(buildPath) ? (JSON.parse(readFileSync(buildPath, "utf-8")) as { sourceHash: string }).sourceHash : null;
  const fresh = built === sourceHash();
  checks.push({ check: "bundle-fresh", pass: fresh, detail: fresh ? "dist/ matches sources" : "dist/ is stale or missing", ...(fresh ? {} : { hint: "bun run plugin:build" }) });

  const manifests = { hermes: read("plugin.json"), claude: read(".claude-plugin/plugin.json"), pi: read("package.json"), openclaw: read("openclaw.plugin.json") };
  const versions = new Set(Object.values(manifests).map((m) => m.version));
  checks.push({ check: "versions-agree", pass: versions.size === 1, detail: [...versions].join(" vs "), ...(versions.size === 1 ? {} : { hint: "bun run plugin:release --version <x.y.z>" }) });
  // Two public names on purpose (see PLUGIN_NAMES): the Claude Code install id
  // stays job-search@rohirik, the portable/OpenClaw name is jobsearch.
  const market = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf-8")) as { plugins: Array<{ name: string; source: string }> };
  const entry = market.plugins.find((p) => p.source === "./job-search");
  const actual = { claude: manifests.claude.name, marketplace: entry?.name, portable: manifests.hermes.name, openclaw: manifests.openclaw.id, npm: manifests.pi.name };
  const expected = { claude: PLUGIN_NAMES.claude, marketplace: PLUGIN_NAMES.claude, portable: PLUGIN_NAMES.portable, openclaw: PLUGIN_NAMES.portable, npm: PLUGIN_NAMES.npm };
  const namesOk = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ check: "names-agree", pass: namesOk, detail: Object.entries(actual).map(([k, v]) => `${k}=${v}`).join(" "), ...(namesOk ? {} : { hint: `expected ${JSON.stringify(expected)}` }) });
  return checks;
}

if (import.meta.main) {
  const checks = runChecks();
  const pass = checks.every((c) => c.pass);
  console.log(JSON.stringify({ ok: true, data: { pass, checks } }));
  process.exit(pass ? 0 : 1);
}
