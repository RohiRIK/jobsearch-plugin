#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Profile } from "../src/profile-schemas.js";
import { loadRegistry, selectTemplates } from "./match/template-engine.js";
import { CODE_ROOT, WORKSPACE as ROOT } from "../src/paths.js";

const TEMPLATES_DIR = join(CODE_ROOT, "templates");
const DEFAULT_PROFILE = join(ROOT, "data", "profile.json");
const PHOTO_PATH = join(ROOT, "assets", "photos", "profile.jpg");

const HELP = `Template Selection CLI — scores CV/cover templates against a job posting and your profile.

Usage:
  select-template.ts --job <posting.md> [options]   Rank templates, pick best available
  select-template.ts --list                         List registry with availability

Options:
  --job <file>          Job posting file (text or markdown)
  --profile <path>      Profile JSON (default: data/profile.json)
  --template <name>     Force a specific template as the CV selection
  --include-stubs       Allow selecting templates without a built template.typ
  --format <json|text>  Output format (default: json)
  -h, --help            Show this help

Output (json): { signals, profile, cv[], cover[], selected, confidence, neutral, warnings }
Each ranked entry carries per-factor scores with reasons. Exit 0 on success, 1 on error.`;

function loadProfile(path: string): Profile | null {
  if (!existsSync(path)) return null;
  try {
    return Profile.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    process.stderr.write(JSON.stringify({ warning: `profile at ${path} failed validation — scoring without it` }) + "\n");
    return null;
  }
}

function renderText(result: ReturnType<typeof selectTemplates>): string {
  const lines: string[] = [];
  lines.push(`Signals: sectors=[${result.signals.sectors.join(", ")}] formality=${result.signals.formality} market=${result.signals.market} rtl=${result.signals.rtl} role=${result.signals.roleType} seniority=${result.signals.seniority}`);
  lines.push(`Profile: seniority=${result.profile.seniority} years=${result.profile.years ?? "?"} completeness=${Math.round(result.profile.completeness * 100)}%`);
  lines.push(`Confidence: ${result.confidence.level} (${result.confidence.score}) — ${result.confidence.reasons.join("; ")}`);
  for (const [label, ranked] of [["CV", result.cv], ["Cover", result.cover]] as const) {
    lines.push(`\n${label} templates:`);
    for (const t of ranked) {
      const marker = result.selected[label === "CV" ? "cv" : "cover"] === t.name ? "→" : " ";
      lines.push(`${marker} ${t.name} ${t.score}/100${t.available ? "" : " [stub]"}`);
      for (const f of t.factors) lines.push(`    ${f.factor} ${f.weighted}/${f.weight}: ${f.reason}`);
    }
  }
  if (result.warnings.length) lines.push(`\nWarnings:\n${result.warnings.map((w) => `  - ${w}`).join("\n")}`);
  return lines.join("\n");
}

export async function main(): Promise<number> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      job: { type: "string" },
      profile: { type: "string" },
      template: { type: "string" },
      list: { type: "boolean" },
      "include-stubs": { type: "boolean" },
      format: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  const registry = loadRegistry(TEMPLATES_DIR);

  if (values.list) {
    const out = registry.map((r) => ({
      name: r.meta.name,
      type: r.type,
      available: r.available,
      formality: r.meta.formality,
      style: r.meta.style,
      sectors: r.meta.sectors,
      markets: r.meta.markets,
      description: r.meta.description,
    }));
    process.stdout.write(JSON.stringify({ templates: out }, null, 2) + "\n");
    return 0;
  }

  if (!values.job || typeof values.job !== "string") {
    process.stderr.write(JSON.stringify({ error: "missing --job <posting file>", code: "BAD_ARGS" }) + "\n");
    return 1;
  }

  const jobPath = resolve(process.cwd(), values.job);
  if (!existsSync(jobPath)) {
    process.stderr.write(JSON.stringify({ error: `file not found: ${jobPath}`, code: "NOT_FOUND" }) + "\n");
    return 1;
  }

  const posting = readFileSync(jobPath, "utf-8");
  const profile = loadProfile(typeof values.profile === "string" ? resolve(process.cwd(), values.profile) : DEFAULT_PROFILE);

  const result = selectTemplates(posting, profile, registry, {
    photoAvailable: existsSync(PHOTO_PATH),
    includeStubs: Boolean(values["include-stubs"]),
    override: typeof values.template === "string" ? values.template : undefined,
  });

  if (values.format === "text") {
    process.stdout.write(renderText(result) + "\n");
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
