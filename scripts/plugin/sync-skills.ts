#!/usr/bin/env bun
/**
 * plugin:sync-skills — copy the skill-factory skills from the canonical
 * RohiRIK/skills library into the plugin, so `manage` can extend the system
 * on any host without that library installed.
 *
 *   bun run plugin:sync-skills --from ../skills [--dry-run]   copy (generated; never hand-edit)
 *   bun run plugin:sync-skills --check [--from ../skills]     verify; exit 1 on drift or hand edits
 *
 * The library stays canonical. Each copy is rewritten for this plugin:
 *   - kebab-case name (Hermes, OpenCode and the Agent Skills spec require
 *     ^[a-z0-9]+(-[a-z0-9]+)*$ matching the directory), so CreateSkill → create-skill
 *   - the library's Claude-only telemetry line is dropped (`jobsearch` logs its own calls)
 *   - a footer records provenance and points at manage/PluginConventions.md,
 *     which lists where this plugin overrides the library's conventions
 * skill-sync.json pins the source commit and every generated file's hash.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { CODE_ROOT as ROOT } from "../../src/paths.js";

export const PLUGIN_SKILLS = join(ROOT, "job-search", "skills");
export const LOCK_PATH = join(ROOT, "job-search", "skill-sync.json");

/** Library skill → plugin skill, plus extra library files a skill references. */
export const SYNCED: Record<string, { name: string; extra?: Array<{ from: string; to: string }> }> = {
  CreateSkill: { name: "create-skill" },
  "CreateCLI-Agent": {
    name: "create-cli-agent",
    extra: ["FrameworkComparison.md", "Patterns.md", "TypescriptPatterns.md"].map((f) => ({ from: `CreateCLI/${f}`, to: f })),
  },
  CreatePlugin: { name: "create-plugin" },
};

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

function stripExecutionLog(text: string): string {
  return text.replace(/\n## Execution Log\n[\s\S]*?(?=\n## |\s*$)/, "\n");
}

export function transform(libName: string, relPath: string, text: string, commit: string): string {
  const { name } = SYNCED[libName];
  let out = stripExecutionLog(text);
  if (relPath === "SKILL.md") {
    out = out.replace(/^name: .+$/m, `name: ${name}`);
    out = out.trimEnd() +
      `\n\n## In this plugin\n\n` +
      `Synced from RohiRIK/skills \`skills/${libName}\` at \`${commit.slice(0, 12)}\` by \`bun run plugin:sync-skills\` — ` +
      `edit the library, not this copy. Where this plugin differs from the library's conventions ` +
      `(kebab-case names, scalar \`allowed-tools\`, no telemetry line, the README skill table in ` +
      `\`job-search/README.md\`), \`../manage/PluginConventions.md\` wins. Other library skills named here ` +
      `(Prompting, Verify, SkillForge, CreateCLI-Human, …) are optional: use them when the host has them, ` +
      `otherwise follow this file alone. Never ask the user to run a command from this skill; run it yourself.\n`;
  }
  return out;
}

export interface Lock {
  source: string;
  commit: string;
  files: Record<string, string>;
}

export function plan(from: string): { commit: string; outputs: Record<string, string> } {
  const git = Bun.spawnSync(["git", "-C", from, "rev-parse", "HEAD"]);
  const commit = git.exitCode === 0 ? git.stdout.toString().trim() : "unknown";
  const outputs: Record<string, string> = {};
  for (const [libName, def] of Object.entries(SYNCED)) {
    const src = join(from, "skills", libName);
    if (!existsSync(join(src, "SKILL.md"))) throw new Error(`library skill not found: ${src}`);
    for (const file of listFiles(src)) {
      const rel = relative(src, file);
      outputs[join(def.name, rel)] = transform(libName, rel, readFileSync(file, "utf-8"), commit);
    }
    for (const extra of def.extra ?? []) {
      outputs[join(def.name, extra.to)] = transform(libName, extra.to, readFileSync(join(from, "skills", extra.from), "utf-8"), commit);
    }
  }
  return { commit, outputs };
}

export function readLock(): Lock | null {
  return existsSync(LOCK_PATH) ? (JSON.parse(readFileSync(LOCK_PATH, "utf-8")) as Lock) : null;
}

/** Problems with the synced copies: hand edits, missing files, or (with a library checkout) upstream drift. */
export function check(from?: string): string[] {
  const lock = readLock();
  if (!lock) return ["skill-sync.json missing — run bun run plugin:sync-skills --from <skills repo>"];
  const problems: string[] = [];
  for (const [rel, hash] of Object.entries(lock.files)) {
    const path = join(PLUGIN_SKILLS, rel);
    if (!existsSync(path)) problems.push(`missing: ${rel}`);
    else if (sha(readFileSync(path, "utf-8")) !== hash) problems.push(`hand-edited: ${rel} (edit RohiRIK/skills, then re-sync)`);
  }
  if (from && existsSync(join(from, "skills"))) {
    const { outputs } = plan(from);
    for (const [rel, text] of Object.entries(outputs)) {
      // Ignore the provenance line: a newer commit alone is not drift.
      const strip = (t: string) => t.replace(/ at `[0-9a-f]{12}` by/, " by");
      const current = existsSync(join(PLUGIN_SKILLS, rel)) ? readFileSync(join(PLUGIN_SKILLS, rel), "utf-8") : "";
      if (strip(current) !== strip(text)) problems.push(`upstream changed: ${rel} (bun run plugin:sync-skills --from ${from})`);
    }
  }
  return problems;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const fromIdx = args.indexOf("--from");
  const from = fromIdx >= 0 ? resolve(args[fromIdx + 1]) : process.env.SKILLS_REPO ? resolve(process.env.SKILLS_REPO) : undefined;
  if (args.includes("--check")) {
    const problems = check(from);
    console.log(JSON.stringify({ ok: true, data: { pass: problems.length === 0, problems } }));
    process.exit(problems.length === 0 ? 0 : 1);
  }
  if (!from) {
    console.log(JSON.stringify({ ok: false, error: { code: 2, type: "usage", message: "pass --from <path to RohiRIK/skills checkout> (or set SKILLS_REPO)", recoverable: true, suggestions: [] } }));
    process.exit(2);
  }
  const { commit, outputs } = plan(from);
  if (args.includes("--dry-run")) {
    console.log(JSON.stringify({ ok: true, data: { dryRun: true, commit, files: Object.keys(outputs) } }));
    process.exit(10);
  }
  for (const def of Object.values(SYNCED)) rmSync(join(PLUGIN_SKILLS, def.name), { recursive: true, force: true });
  const files: Record<string, string> = {};
  for (const [rel, text] of Object.entries(outputs)) {
    const path = join(PLUGIN_SKILLS, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    files[rel] = sha(text);
  }
  const lock: Lock = { source: "https://github.com/RohiRIK/skills", commit, files };
  writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, data: { commit, files: Object.keys(files).length } }));
}
