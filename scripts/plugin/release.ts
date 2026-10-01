#!/usr/bin/env bun
/**
 * plugin:release — bump the plugin version in every manifest at once and
 * rebuild the bundle. Claude Code pins installs to `version`, so a change
 * that is pushed without a bump never reaches installed users.
 *
 *   bun run plugin:release --version 1.2.0 --dry-run   preview (exit 10)
 *   bun run plugin:release --version 1.2.0 --yes       write manifests, CHANGELOG heading, rebuild
 *
 * It never commits, tags or pushes: those are separate, human-approved steps.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CODE_ROOT as ROOT } from "../../src/paths.js";

const MANIFESTS = ["job-search/plugin.json", "job-search/.claude-plugin/plugin.json", "job-search/package.json"];
const SEMVER = /^\d+\.\d+\.\d+$/;

function emit(value: unknown, code: number): never {
  console.log(JSON.stringify(value));
  process.exit(code);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const version = args[args.indexOf("--version") + 1];
  if (!args.includes("--version") || !version || !SEMVER.test(version)) {
    emit({ ok: false, error: { code: 2, type: "usage", message: "pass --version <x.y.z>", recoverable: true, suggestions: ["bun run plugin:release --version 1.2.0 --dry-run"] } }, 2);
  }
  const current = JSON.parse(readFileSync(join(ROOT, MANIFESTS[0]), "utf-8")).version as string;
  const cmp = (a: string, b: string) => a.split(".").map(Number).reduce((acc, n, i) => acc || n - Number(b.split(".")[i]), 0);
  if (cmp(version, current) <= 0) {
    emit({ ok: false, error: { code: 5, type: "conflict", message: `version ${version} is not newer than ${current}`, recoverable: true, suggestions: [] } }, 5);
  }
  const changes = MANIFESTS.map((m) => ({ file: m, from: JSON.parse(readFileSync(join(ROOT, m), "utf-8")).version, to: version }));
  if (args.includes("--dry-run")) emit({ ok: true, data: { dryRun: true, changes, then: ["bun run plugin:build", "CHANGELOG heading"] } }, 10);
  if (!args.includes("--yes")) {
    emit({ ok: false, error: { code: 2, type: "confirmation_required", message: "plugin:release writes manifests; pass --yes after the user confirms, or --dry-run", recoverable: true, suggestions: [`bun run plugin:release --version ${version} --dry-run`] } }, 2);
  }
  for (const m of MANIFESTS) {
    const path = join(ROOT, m);
    const json = JSON.parse(readFileSync(path, "utf-8"));
    json.version = version;
    writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  }
  const changelogPath = join(ROOT, "CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf-8");
  const today = new Date().toISOString().slice(0, 10);
  // Items under the Unreleased heading become this version's notes.
  const heading = changelog.match(/^## \[?Unreleased\]?$/m)?.[0];
  if (heading) writeFileSync(changelogPath, changelog.replace(heading, `${heading}\n\n## ${version} - ${today}`));
  const build = Bun.spawnSync([process.execPath, join(ROOT, "scripts", "plugin", "build.ts")], { cwd: ROOT });
  if (build.exitCode !== 0) emit({ ok: false, error: { code: 30, type: "internal", message: `plugin:build failed: ${build.stderr.toString().trim()}`, recoverable: false, suggestions: [] } }, 30);
  emit({ ok: true, data: { version, changes, next: ["bun run gates", `git commit -am "chore(release): job-search ${version}"`, `git tag job-search--v${version}  (after approval)`, "git push --follow-tags  (after approval)"] } }, 0);
}
