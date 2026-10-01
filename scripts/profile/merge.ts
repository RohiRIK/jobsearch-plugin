#!/usr/bin/env bun
// merge.ts — Merge staging files into data/profile.json.
// Tier 1 CLI: parseFlags, JSON stdout, error JSON to stderr, exit 0/1.
//
// Usage:
//   bun run scripts/profile/merge.ts
//   bun run scripts/profile/merge.ts --help

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Profile } from "../../src/profile-schemas.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";

// ─── Types ────────────────────────────────────────────────────────────────

interface StagingIdentity {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  country?: string | null;
  languages?: string[];
  linkedin?: string | null;
  github?: string | null;
  blog?: string | null;
  headline?: string | null;
  status?: string | null;
}

interface StagingEntry {
  identity?: StagingIdentity;
  education?: Array<{
    degree?: string;
    field?: string;
    institution?: string;
    school?: string;
    location?: string | null;
    startYear?: number | null;
    endYear?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    thesis?: string | null;
  }>;
  experience?: Array<{
    title?: string;
    company?: string;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    dates?: string;
    bullets?: string[];
    responsibilities?: string[];
    achievements?: string[];
    description?: string | null;
  }>;
  skills?: Array<{ category?: string; skills?: string[] }> | string[];
  languages?: string[];
  publications?: Array<{ text?: string; authors?: string; year?: number; title?: string; journal?: string }>;
  awards?: Array<{ text?: string; name?: string; event?: string; year?: number }>;
}

// ─── Configuration ────────────────────────────────────────────────────────

const STAGING_DIR = join(ROOT, "data", "staging");
const PROFILE_PATH = join(ROOT, "data", "profile.json");

// ─── Help ─────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";

const HELP = `merge — Merge staging files into data/profile.json

USAGE
  bun run scripts/profile/merge.ts [flags]

FLAGS
  --help, -h          Show this help message
  --version, -v       Show version
  --output, -o <path> Custom output path (default: data/profile.json)

BEHAVIOR
  Reads all JSON files in data/staging/ and merges into data/profile.json.
  Merge strategy:
  - Scalars: later sources override earlier ones
  - Arrays: concatenated, deduplicated by title+company or degree+institution
  - Source flags track which sources contributed data

  Files are processed in alphabetical order (blog, cv, github, linkedin, manual).

OUTPUT
  JSON to stdout (merge summary)
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error
`;

// ─── Parse Flags ──────────────────────────────────────────────────────────

interface Flags {
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
  output?: string;
  o?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-v") flags.version = true;
    else if (a === "--output" || a === "-o") {
      flags.output = argv[++i];
    }
  }
  return flags;
}

// ─── Merge Logic ──────────────────────────────────────────────────────────

export function normalizeStaging(raw: Record<string, unknown>): StagingEntry {
  if (raw.identity || !("repos" in raw || "github" in raw)) {
    return raw as StagingEntry;
  }
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);
  const url = (v: unknown) => (typeof v === "string" && v.startsWith("http") ? v : undefined);
  const langRecord =
    raw.languages && typeof raw.languages === "object" && !Array.isArray(raw.languages)
      ? Object.keys(raw.languages as Record<string, number>)
      : [];
  return {
    identity: {
      name: str(raw.name),
      email: str(raw.email),
      location: str(raw.location),
      blog: url(raw.blog),
      linkedin: url(raw.linkedin),
      github: url(raw.github),
      headline: str(raw.bio),
    },
    skills:
      langRecord.length > 0
        ? [{ category: "Programming Languages", skills: langRecord }]
        : undefined,
  };
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const existing = result[key];
      result[key] = Array.isArray(existing)
        ? [...existing, ...value]
        : value;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      result[key] = deepMerge(
        (result[key] as Record<string, unknown>) ?? {},
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function dedupExperience(items: StagingEntry["experience"]): StagingEntry["experience"] {
  const seen = new Set<string>();
  return items?.filter((item) => {
    const key = `${item.title ?? ""}|${item.company ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupEducation(items: StagingEntry["education"]): StagingEntry["education"] {
  const seen = new Set<string>();
  return items?.filter((item) => {
    const key = `${item.degree ?? ""}|${item.field ?? ""}|${item.institution ?? item.school ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupSkills(
  items: Array<{ category?: string; skills?: string[] }> | string[] | undefined,
): Array<{ category: string; skills: string[] }> {
  if (!items) return [];

  // Normalize to array of { category, skills }
  const normalized: Array<{ category: string; skills: string[] }> = [];
  for (const item of items) {
    if (typeof item === "string") {
      normalized.push({ category: "General", skills: [item] });
    } else if (item.category && item.skills) {
      normalized.push({ category: item.category, skills: item.skills });
    }
  }

  // Merge by category
  const byCat = new Map<string, Set<string>>();
  for (const { category, skills } of normalized) {
    if (!byCat.has(category)) byCat.set(category, new Set());
    for (const s of skills) {
      byCat.get(category)!.add(s);
    }
  }

  return Array.from(byCat.entries()).map(([category, skills]) => ({
    category,
    skills: Array.from(skills),
  }));
}

// ─── Main ─────────────────────────────────────────────────────────────────

export function main(): number {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help || flags.h) {
    process.stdout.write(HELP);
    return 0;
  }

  if (flags.version || flags.v) {
    process.stdout.write(`merge version ${VERSION}\n`);
    return 0;
  }

  // Read staging files
  let files: string[];
  try {
    files = readdirSync(STAGING_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    process.stderr.write(
      JSON.stringify({
        error: `Staging directory not found: ${STAGING_DIR}`,
        code: "NO_STAGING",
      }) + "\n",
    );
    return 1;
  }

  if (files.length === 0) {
    process.stderr.write(
      JSON.stringify({
        error: "No staging files found in data/staging/",
        code: "EMPTY_STAGING",
      }) + "\n",
    );
    return 1;
  }

  // Merge all staging entries
  const sources: Record<string, boolean> = {};
  let mergedIdentity: Record<string, unknown> = {};
  const allEducation: StagingEntry["education"] = [];
  const allExperience: StagingEntry["experience"] = [];
  const allSkills: Array<{ category?: string; skills?: string[] }> = [];
  const allLanguages: string[] = [];
  const allPublications: StagingEntry["publications"] = [];
  const allAwards: StagingEntry["awards"] = [];

  for (const file of files) {
    const filePath = join(STAGING_DIR, file);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const data: StagingEntry = normalizeStaging(JSON.parse(raw));

      const sourceName = file.replace(".json", "").replace("-manual", "");
      sources[sourceName] = true;

      if (data.identity) {
        mergedIdentity = deepMerge(mergedIdentity, data.identity as Record<string, unknown>);
      }
      if (data.education) allEducation.push(...data.education);
      if (data.experience) allExperience.push(...data.experience);
      if (data.skills) {
        for (const s of data.skills) {
          if (typeof s === "object") allSkills.push(s);
        }
      }
      if (Array.isArray(data.languages)) allLanguages.push(...data.languages);
      if (data.publications) allPublications.push(...data.publications);
      if (data.awards) allAwards.push(...data.awards);
    } catch (err) {
      process.stderr.write(
        JSON.stringify({
          warning: `Skipped staging file ${file}: ${err instanceof Error ? err.message : String(err)}`,
          code: "STAGING_SKIPPED",
        }) + "\n",
      );
    }
  }

  // Build profile — filter out nulls
  const identity = {
    name: mergedIdentity.name ?? undefined,
    firstName: mergedIdentity.firstName ?? undefined,
    lastName: mergedIdentity.lastName ?? undefined,
    email: mergedIdentity.email ?? undefined,
    phone: mergedIdentity.phone ?? undefined,
    location: mergedIdentity.location ?? undefined,
    country: mergedIdentity.country ?? undefined,
    languages: [...new Set(allLanguages)].filter(Boolean),
    linkedin: mergedIdentity.linkedin ?? undefined,
    github: mergedIdentity.github ?? undefined,
    blog: mergedIdentity.blog ?? undefined,
    headline: mergedIdentity.headline ?? undefined,
    status: mergedIdentity.status ?? undefined,
  };

  const profile: Record<string, unknown> = {
    identity,
    education: dedupEducation(allEducation),
    experience: dedupExperience(allExperience),
    skills: dedupSkills(allSkills),
    publications: allPublications.length > 0 ? allPublications : undefined,
    awards: allAwards.length > 0 ? allAwards : undefined,
    sources,
    lastFetched: new Date().toISOString(),
  };

  // Validate with Zod
  const parsed = Profile.safeParse(profile);
  if (!parsed.success) {
    process.stderr.write(
      JSON.stringify({
        error: "Profile validation failed",
        details: parsed.error.issues,
        code: "VALIDATION_ERROR",
      }) + "\n",
    );
    return 1;
  }

  // Write
  const outPath = flags.output ?? PROFILE_PATH;
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(parsed.data, null, 2) + "\n");

  // Summary
  const resultIdentity = parsed.data.identity;
  process.stdout.write(
    JSON.stringify(
      {
        sources: Object.keys(sources),
        name: resultIdentity.name,
        experience: parsed.data.experience?.length ?? 0,
        education: parsed.data.education?.length ?? 0,
        skills: parsed.data.skills?.reduce((n, s) => n + s.skills.length, 0) ?? 0,
        output: outPath,
      },
      null,
      2,
    ) + "\n",
  );

  return 0;
}

if (import.meta.main) process.exit(main());
