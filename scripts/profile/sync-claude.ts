#!/usr/bin/env bun
// sync-claude.ts — Regenerate CLAUDE.md Candidate Profile from data/profile.json.
// Tier 1 CLI: parseFlags, JSON stdout, error JSON to stderr, exit 0/1.
//
// Usage:
//   bun run scripts/profile/sync-claude.ts
//   bun run scripts/profile/sync-claude.ts --help

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Profile } from "../../src/profile-schemas.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";

// ─── Configuration ────────────────────────────────────────────────────────

const PROFILE_PATH = join(ROOT, "data", "profile.json");
const CLAUDE_PATH = join(ROOT, "CLAUDE.md");

// ─── Help ─────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";

const HELP = `sync-claude — Regenerate CLAUDE.md Candidate Profile from data/profile.json

USAGE
  bun run scripts/profile/sync-claude.ts [flags]

FLAGS
  --help, -h          Show this help message
  --version, -v       Show version
  --claude <path>     Custom CLAUDE.md path (default: CLAUDE.md)
  --profile <path>    Custom profile path (default: data/profile.json)

BEHAVIOR
  Reads data/profile.json and regenerates the Candidate Profile section
  of CLAUDE.md (between "## Candidate Profile" and the following level-2 heading).
  All other sections remain unchanged.

OUTPUT
  JSON to stdout (sync summary)
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error
`;

// ─── Parse Flags ──────────────────────────────────────────────────────────

interface Flags {
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
  claude?: string;
  profile?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-v") flags.version = true;
    else if (a === "--claude") flags.claude = argv[++i];
    else if (a === "--profile") flags.profile = argv[++i];
  }
  return flags;
}

// ─── Profile → Markdown ──────────────────────────────────────────────────

function displayLocation(location?: string | null, country?: string | null): string | null {
  const place = location?.trim();
  const nation = country?.trim();
  if (!place) return nation ?? null;
  if (!nation || place.toLocaleLowerCase("en-US").includes(nation.toLocaleLowerCase("en-US"))) return place;
  return `${place}, ${nation}`;
}

function profileToMarkdown(profile: Profile): string {
  const lines: string[] = [];

  // Identity
  lines.push("### Identity");
  if (profile.identity.name) lines.push(`- **Name:** ${profile.identity.name}`);
  const location = displayLocation(profile.identity.location, profile.identity.country);
  if (location) lines.push(`- **Location:** ${location}`);
  if (profile.identity.languages?.length) {
    lines.push(`- **Languages:** ${profile.identity.languages.join(", ")}`);
  }
  if (profile.identity.status) lines.push(`- **Status:** ${profile.identity.status}`);
  if (profile.identity.headline) lines.push(`- **LinkedIn headline:** "${profile.identity.headline}"`);
  // CLAUDE.md is tracked: contact details and personal URLs remain only in gitignored data/profile.json.

  if (profile.workPreferences) {
    lines.push("");
    lines.push("### Work Preferences");
    lines.push(`- **Remote:** ${profile.workPreferences.remote ? "accepted" : "not accepted"}`);
    lines.push(`- **Hybrid:** ${profile.workPreferences.hybrid ? "accepted" : "not accepted"}`);
    lines.push(`- **Relocation:** ${profile.workPreferences.relocation ? "considered" : "not currently considered"}`);
    if (profile.workPreferences.maxOfficeDaysPerWeek !== undefined) {
      lines.push(`- **Maximum office days/week:** ${profile.workPreferences.maxOfficeDaysPerWeek}`);
    }
    if (profile.workPreferences.workAuthorization) {
      lines.push(`- **Work authorization:** ${profile.workPreferences.workAuthorization.eu ?? "see data/profile.json"}`);
    }
  }

  // Education
  if (profile.education?.length) {
    lines.push("");
    lines.push("### Education");
    for (const edu of profile.education) {
      const years = [edu.startYear, edu.endYear].filter(Boolean).join("-");
      lines.push(`- **${edu.degree} in ${edu.field}** (${years}) - ${edu.institution}`);
      if (edu.thesis) lines.push(`  - Thesis: "${edu.thesis}"`);
      if (edu.topics?.length) lines.push(`  - Topics: ${edu.topics.join(", ")}`);
    }
  }

  // Experience
  if (profile.experience?.length) {
    lines.push("");
    lines.push("### Professional Experience");
    for (const exp of profile.experience) {
      const dates = [exp.startDate, exp.endDate ?? "Present"].filter(Boolean).join(" - ");
      lines.push(`- **${exp.title}** (${dates}) - **${exp.company}**${exp.location ? ` (${exp.location})` : ""}`);
      if (exp.responsibilities?.length) {
        for (const r of exp.responsibilities.slice(0, 3)) {
          lines.push(`  - ${r}`);
        }
      }
      if (exp.achievements?.length) {
        for (const a of exp.achievements.slice(0, 3)) {
          lines.push(`  - ${a}`);
        }
      }
    }
  }

  // Skills
  if (profile.skills?.length) {
    lines.push("");
    lines.push("### Technical Skills");
    for (const cat of profile.skills) {
      lines.push(`- **${cat.category}:** ${cat.skills.join(", ")}`);
    }
  }

  // Certifications
  if (profile.certifications?.length) {
    lines.push("");
    lines.push("### Certifications");
    for (const cert of profile.certifications) {
      const hours = cert.hours ? ` - ${cert.hours}h` : "";
      const date = cert.date ? ` - completed ${cert.date}` : "";
      lines.push(`- **${cert.name}**${hours}${date}`);
    }
  }

  // Publications
  if (profile.publications?.length) {
    lines.push("");
    lines.push("### Publications");
    for (const pub of profile.publications) {
      lines.push(`- ${pub.authors} (${pub.year}). ${pub.title}. ${pub.journal}.`);
    }
  }

  // Awards
  if (profile.awards?.length) {
    lines.push("");
    lines.push("### Awards");
    for (const award of profile.awards) {
      lines.push(`- ${award.name} - ${award.event} (${award.year})`);
    }
  }

  // Behavioral
  if (profile.behavioral) {
    lines.push("");
    lines.push("### Behavioral Profile");
    if (profile.behavioral.traits?.length) {
      for (const t of profile.behavioral.traits) {
        lines.push(`- **${t.trait}** - ${t.description}`);
      }
    }
    if (profile.behavioral.strengths?.length) {
      lines.push(`- **Strengths:** ${profile.behavioral.strengths.join(", ")}`);
    }
    if (profile.behavioral.growthAreas?.length) {
      lines.push(`- **Growth areas:** ${profile.behavioral.growthAreas.join(", ")}`);
    }
    if (profile.behavioral.idealEnvironment) {
      lines.push(`- **Thrives in:** ${profile.behavioral.idealEnvironment}`);
    }
  }

  // Excites
  if (profile.excites?.length) {
    lines.push("");
    lines.push("### What Excites You");
    for (const e of profile.excites) {
      lines.push(`- ${e}`);
    }
  }

  // Target Sectors
  if (profile.targetSectors?.length) {
    lines.push("");
    lines.push("### Target Sectors");
    for (const ts of profile.targetSectors) {
      lines.push(`- ${ts.sector}: ${ts.companies.join(", ")}`);
    }
  }

  // Deal Breakers
  if (profile.dealBreakers?.length) {
    lines.push("");
    lines.push("### Deal-breakers");
    for (const db of profile.dealBreakers) {
      lines.push(`- ${db}`);
    }
  }

  return lines.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────

export function main(): number {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help || flags.h) {
    process.stdout.write(HELP);
    return 0;
  }

  if (flags.version || flags.v) {
    process.stdout.write(`sync-claude version ${VERSION}\n`);
    return 0;
  }

  const profilePath = flags.profile ?? PROFILE_PATH;
  const claudePath = flags.claude ?? CLAUDE_PATH;

  // Read profile
  let profileRaw: string;
  try {
    profileRaw = readFileSync(profilePath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      JSON.stringify({ error: `Cannot read profile: ${msg}`, code: "NO_PROFILE" }) + "\n",
    );
    return 1;
  }

  let profileData: unknown;
  try {
    profileData = JSON.parse(profileRaw);
  } catch {
    process.stderr.write(
      JSON.stringify({ error: "Invalid JSON in profile", code: "BAD_JSON" }) + "\n",
    );
    return 1;
  }

  const parsed = Profile.safeParse(profileData);
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

  // Read CLAUDE.md
  let claude: string;
  try {
    claude = readFileSync(claudePath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      JSON.stringify({ error: `Cannot read CLAUDE.md: ${msg}`, code: "NO_CLAUDE" }) + "\n",
    );
    return 1;
  }

  // Replace Candidate Profile section
  const profileMd = profileToMarkdown(parsed.data);

  const startMarker = "## Candidate Profile";
  const startIdx = claude.indexOf(startMarker);
  const sectionStart = startIdx === -1 ? -1 : claude.indexOf("\n", startIdx);
  const followingHeading = sectionStart === -1
    ? null
    : /^##\s+.+$/m.exec(claude.slice(sectionStart + 1));
  const endIdx = followingHeading?.index === undefined ? -1 : sectionStart + 1 + followingHeading.index;

  if (startIdx === -1 || sectionStart === -1 || endIdx === -1) {
    process.stderr.write(
      JSON.stringify({
        error: "Cannot find Candidate Profile section followed by another level-2 heading in CLAUDE.md",
        code: "MARKER_NOT_FOUND",
      }) + "\n",
    );
    return 1;
  }

  const newClaude =
    claude.slice(0, sectionStart + 1) +
    "\n" +
    profileMd +
    "\n\n" +
    claude.slice(endIdx);

  writeFileSync(claudePath, newClaude);

  // Summary
  process.stdout.write(
    JSON.stringify(
      {
        name: parsed.data.identity.name,
        sections: {
          identity: !!parsed.data.identity,
          education: parsed.data.education?.length ?? 0,
          experience: parsed.data.experience?.length ?? 0,
          skills: parsed.data.skills?.reduce((n, s) => n + s.skills.length, 0) ?? 0,
        },
        output: claudePath,
      },
      null,
      2,
    ) + "\n",
  );

  return 0;
}

if (import.meta.main) process.exit(main());
