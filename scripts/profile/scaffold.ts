#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Profile } from "../../src/profile-schemas.js";
import { CODE_ROOT, WORKSPACE as ROOT } from "../../src/paths.js";
import { PROJECT_DOMAINS } from "../../src/project-matching.js";

const TEMPLATE = resolve(CODE_ROOT, "data/profile.json.example");
const DEFAULT_OUTPUT = resolve(ROOT, "data/profile.json");

const HELP = `profile:scaffold — create data/profile.json from the committed placeholder

Usage:
  bun run profile:scaffold [options]

Options:
  --output <path>   Destination profile (default: data/profile.json)
  --force           Overwrite an existing destination
  --print           Print the validated template instead of writing it
  --check           Validate an existing profile (default: data/profile.json)
  -h, --help        Show this help

The template contains placeholders only. Replace every placeholder with verified
facts, or run the normal import pipeline afterwards:

  bun run profile:scaffold
  bun run profile              # fetch configured sources and merge into the profile
  bun run projects sync --dry-run

Exit 0 on success, 1 when the template is invalid, the destination exists, or
--print is used.`;

function fail(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n");
  return 1;
}

/**
 * Valid but silently ineffective profile data. In the owner E2E run, free-form
 * project domains ("identity", "sso") matched nothing, so every client case
 * scored below relevance and never reached the evidence ledger.
 */
export function profileWarnings(profile: Profile): string[] {
  const warnings: string[] = [];
  const known = Object.keys(PROJECT_DOMAINS);
  const roleIds = new Set((profile.experience ?? []).map((role) => role.id).filter(Boolean));
  for (const project of profile.projects ?? []) {
    const unknown = project.domains.filter((domain) => !known.includes(domain));
    if (unknown.length > 0) warnings.push(`project ${project.slug}: unknown domain(s) ${unknown.join(", ")}; matching uses ${known.join(", ")}`);
    if (project.domains.length > 0 && unknown.length === project.domains.length) warnings.push(`project ${project.slug}: no known domain, so it can never be selected for a CV`);
    if (project.engagementId && !roleIds.has(project.engagementId)) warnings.push(`project ${project.slug}: engagementId "${project.engagementId}" matches no experience id`);
  }
  return warnings;
}

export async function main(argv = Bun.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      output: { type: "string" },
      force: { type: "boolean", default: false },
      print: { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!existsSync(TEMPLATE)) return fail(`placeholder profile missing: ${TEMPLATE}`, "NO_TEMPLATE");

  if (values.check) {
    const target = resolve(process.cwd(), values.output ?? DEFAULT_OUTPUT);
    if (!existsSync(target)) return fail(`profile not found: ${target}. Run: bun run profile:scaffold`, "NO_PROFILE");
    let checked: Profile;
    try {
      checked = Profile.parse(JSON.parse(readFileSync(target, "utf-8")));
    } catch (cause) {
      return fail(`profile failed schema validation: ${target}`, "BAD_PROFILE");
    }
    process.stdout.write(JSON.stringify({ valid: true, profile: target, warnings: profileWarnings(checked) }, null, 2) + "\n");
    return 0;
  }

  let profile: Profile;
  try {
    profile = Profile.parse(JSON.parse(readFileSync(TEMPLATE, "utf-8")));
  } catch (cause) {
    return fail("placeholder profile failed schema validation", "BAD_TEMPLATE");
  }

  const rendered = JSON.stringify(profile, null, 2) + "\n";
  if (values.print) {
    process.stdout.write(rendered);
    return 1;
  }

  const output = resolve(process.cwd(), values.output ?? DEFAULT_OUTPUT);
  if (existsSync(output) && !values.force) {
    return fail(`destination already exists: ${output}. Refusing to overwrite; pass --force only when intended.`, "OUTPUT_EXISTS");
  }

  writeFileSync(output, rendered, { mode: 0o600 });
  process.stdout.write(
    JSON.stringify({
      created: output,
      template: TEMPLATE,
      next: "replace every placeholder, then run: bun run gates",
      warnings: ["This file is gitignored. Never commit real contact details."],
    }, null, 2) + "\n",
  );
  return 0;
}

if (import.meta.main) process.exit(await main());
