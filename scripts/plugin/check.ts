#!/usr/bin/env bun
/**
 * plugin:check — the plugin's own gate, run by `bun run gates` (pre-push):
 * committed bundle is fresh, and every host manifest agrees on name/version.
 * Emits one JSON envelope; exit 0 when every check passes.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CODE_ROOT as ROOT } from "../../src/paths.js";
import { sourceHash } from "./build.js";

const PLUGIN = join(ROOT, "job-search");
const read = (p: string) => JSON.parse(readFileSync(join(PLUGIN, p), "utf-8"));

export function runChecks(): Array<{ check: string; pass: boolean; detail: string; hint?: string }> {
  const checks: Array<{ check: string; pass: boolean; detail: string; hint?: string }> = [];
  const buildPath = join(PLUGIN, "dist", "BUILD.json");
  const built = existsSync(buildPath) ? (JSON.parse(readFileSync(buildPath, "utf-8")) as { sourceHash: string }).sourceHash : null;
  const fresh = built === sourceHash();
  checks.push({ check: "bundle-fresh", pass: fresh, detail: fresh ? "dist/ matches sources" : "dist/ is stale or missing", ...(fresh ? {} : { hint: "bun run plugin:build" }) });

  const manifests = { hermes: read("plugin.json"), claude: read(".claude-plugin/plugin.json"), pi: read("package.json") };
  const versions = new Set(Object.values(manifests).map((m) => m.version));
  checks.push({ check: "versions-agree", pass: versions.size === 1, detail: [...versions].join(" vs "), ...(versions.size === 1 ? {} : { hint: "bun run plugin:release --version <x.y.z>" }) });
  const names = new Set([manifests.hermes.name, manifests.claude.name]);
  checks.push({ check: "names-agree", pass: names.size === 1, detail: [...names].join(" vs ") });
  return checks;
}

if (import.meta.main) {
  const checks = runChecks();
  const pass = checks.every((c) => c.pass);
  console.log(JSON.stringify({ ok: true, data: { pass, checks } }));
  process.exit(pass ? 0 : 1);
}
