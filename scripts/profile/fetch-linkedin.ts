#!/usr/bin/env bun
// fetch-linkedin.ts — Attempt to scrape LinkedIn profile or generate manual template.
// Tier 1 CLI: parseFlags, JSON stdout, error JSON to stderr, exit 0/1.
//
// Usage:
//   bun run scripts/profile/fetch-linkedin.ts <url>
//   bun run scripts/profile/fetch-linkedin.ts --manual
//   bun run scripts/profile/fetch-linkedin.ts --help

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { WORKSPACE as ROOT } from "../../src/paths.js";

// ─── Types ────────────────────────────────────────────────────────────────

interface LinkedInStaging {
  name: string | null;
  headline: string | null;
  location: string | null;
  experience: Array<{
    title: string;
    company: string;
    dates: string;
    description: string | null;
  }>;
  education: Array<{
    school: string;
    degree: string;
    dates: string;
  }>;
  skills: string[];
}

// ─── Configuration ────────────────────────────────────────────────────────

const STAGING_DIR = join(ROOT, "data", "staging");

// ─── Help ─────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";

const HELP = `fetch-linkedin — Scrape LinkedIn profile or create manual template

USAGE
  bun run scripts/profile/fetch-linkedin.ts <linkedin-url>
  bun run scripts/profile/fetch-linkedin.ts --manual
  bun run scripts/profile/fetch-linkedin.ts --help

FLAGS
  --help, -h          Show this help message
  --version, -v       Show version
  --manual            Write a fillable template to data/staging/linkedin-manual.json
  --output, -o <path> Custom output path

BEHAVIOR
  Attempts to scrape a public LinkedIn profile. LinkedIn actively blocks
  scraping, so this will likely fail with a helpful message.

  On failure, suggests --manual to create a fillable template.

  --manual writes a JSON template with all profile fields that you fill
  by hand, then run merge to incorporate into your profile.

OUTPUT
  JSON to stdout
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error

EXAMPLES
  bun run scripts/profile/fetch-linkedin.ts https://linkedin.com/in/username
  bun run scripts/profile/fetch-linkedin.ts --manual
`;

// ─── Parse Flags ──────────────────────────────────────────────────────────

interface Flags {
  _: string[];
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
  manual?: boolean;
  output?: string;
  o?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-v") flags.version = true;
    else if (a === "--manual") flags.manual = true;
    else if (a === "--output" || a === "-o") {
      flags.output = argv[++i];
    } else if (a.startsWith("-")) {
      // unknown flag
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

// ─── Manual Template ──────────────────────────────────────────────────────

function createManualTemplate(): LinkedInStaging {
  return {
    name: null,
    headline: null,
    location: null,
    experience: [
      {
        title: "[Job Title]",
        company: "[Company Name]",
        dates: "[Start Date] - [End Date]",
        description: null,
      },
    ],
    education: [
      {
        school: "[School Name]",
        degree: "[Degree] in [Field]",
        dates: "[Start Year] - [End Year]",
      },
    ],
    skills: ["[Skill 1]", "[Skill 2]"],
  };
}

// ─── LinkedIn Scraping (best-effort) ──────────────────────────────────────

async function attemptScrape(_url: string): Promise<LinkedInStaging | null> {
  // LinkedIn blocks automated scraping aggressively.
  // This is a best-effort attempt; on failure, return null.
  try {
    const resp = await fetch(_url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!resp.ok) return null;

    const html = await resp.text();

    // LinkedIn returns a login wall for most profiles
    if (html.includes("sign-in") || html.includes("authwall")) return null;

    // Very basic extraction — will rarely work due to JS rendering
    const nameMatch = html.match(/<title>([^|<]+)/);
    const headlineMatch = html.match(
      /class="text-body-medium"[^>]*>([^<]+)/,
    );

    return {
      name: nameMatch?.[1]?.trim() ?? null,
      headline: headlineMatch?.[1]?.trim() ?? null,
      location: null,
      experience: [],
      education: [],
      skills: [],
    };
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

export async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help || flags.h) {
    process.stdout.write(HELP);
    return 0;
  }

  if (flags.version || flags.v) {
    process.stdout.write(`fetch-linkedin version ${VERSION}\n`);
    return 0;
  }

  // --manual mode
  if (flags.manual) {
    const template = createManualTemplate();
    const outPath = flags.output ?? join(STAGING_DIR, "linkedin-manual.json");
    mkdirSync(join(outPath, ".."), { recursive: true });
    writeFileSync(outPath, JSON.stringify(template, null, 2) + "\n");

    process.stdout.write(
      JSON.stringify(
        {
          source: "linkedin-manual",
          message: "Template created. Fill in the fields, then run merge.",
          output: outPath,
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  // URL mode
  const url = flags._[0];
  if (!url) {
    process.stderr.write(
      JSON.stringify({
        error:
          "Provide a LinkedIn URL or use --manual for a fillable template",
        code: "NO_URL",
      }) + "\n",
    );
    return 1;
  }

  if (!url.includes("linkedin.com")) {
    process.stderr.write(
      JSON.stringify({
        error: "URL must be a linkedin.com profile URL",
        code: "INVALID_URL",
      }) + "\n",
    );
    return 1;
  }

  // Attempt scrape
  const data = await attemptScrape(url);

  if (!data) {
    process.stderr.write(
      JSON.stringify({
        error:
          "LinkedIn blocked scraping (auth wall). Use --manual to create a fillable template instead.",
        code: "BLOCKED",
        suggestion:
          "Run: bun run scripts/profile/fetch-linkedin.ts --manual",
      }) + "\n",
    );
    return 1;
  }

  // Write staging file
  const outPath = flags.output ?? join(STAGING_DIR, "linkedin.json");
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n");

  process.stdout.write(
    JSON.stringify(
      {
        source: "linkedin",
        name: data.name,
        headline: data.headline,
        output: outPath,
      },
      null,
      2,
    ) + "\n",
  );

  return 0;
}

if (import.meta.main) main().then((code) => process.exit(code));
