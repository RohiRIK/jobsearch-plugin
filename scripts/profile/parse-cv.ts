#!/usr/bin/env bun
// parse-cv.ts — Parse LaTeX CV files into structured profile data.
// Tier 1 CLI: parseFlags, JSON stdout, error JSON to stderr, exit 0/1.
//
// Usage:
//   bun run scripts/profile/parse-cv.ts <path-to-cv.tex>
//   bun run scripts/profile/parse-cv.ts cv/main_example.tex
//   bun run scripts/profile/parse-cv.ts --help

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { WORKSPACE as ROOT } from "../../src/paths.js";

// ─── Types ────────────────────────────────────────────────────────────────

interface CvStaging {
  identity: {
    name: string | null;
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    github: string | null;
    location: string | null;
  };
  education: Array<{
    degree: string;
    field: string;
    institution: string;
    location: string | null;
    startYear: number | null;
    endYear: number | null;
    thesis: string | null;
  }>;
  experience: Array<{
    title: string;
    company: string;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    bullets: string[];
  }>;
  skills: string[];
  languages: string[];
  publications: Array<{
    text: string;
  }>;
  awards: Array<{
    text: string;
  }>;
}

// ─── Configuration ────────────────────────────────────────────────────────

const STAGING_DIR = join(ROOT, "data", "staging");

// ─── Help ─────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";

const HELP = `parse-cv — Parse LaTeX CV files into structured profile data

USAGE
  bun run scripts/profile/parse-cv.ts <path-to-cv.tex>
  bun run scripts/profile/parse-cv.ts cv/main_example.tex

FLAGS
  --help, -h          Show this help message
  --version, -v       Show version
  --output, -o <path> Custom output path

BEHAVIOR
  Extracts structured data from moderncv-style LaTeX CVs:
  - Identity: \\name, \\email, \\phone, \\href (linkedin, github)
  - Education: \\cventry inside Education section
  - Experience: \\cventry inside Professional Experience section
  - Skills: \\item entries in Core Competencies section
  - Languages: text in Languages section
  - Publications, Awards: text in respective sections

  Placeholder tokens (e.g. [YOUR_NAME]) are omitted from output.

OUTPUT
  JSON to stdout
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error

EXAMPLES
  bun run scripts/profile/parse-cv.ts cv/main_example.tex
  bun run scripts/profile/parse-cv.ts --output data/staging/cv.json cv/main.tex
`;

// ─── Parse Flags ──────────────────────────────────────────────────────────

interface Flags {
  _: string[];
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
  output?: string;
  o?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-v") flags.version = true;
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

// ─── LaTeX Extraction Helpers ─────────────────────────────────────────────

function extractCommandArg(tex: string, cmd: string): string | null {
  // Match \cmd{arg1}{arg2} or \cmd{arg}
  const re = new RegExp(`\\\\${cmd}\\{([^}]*?)\\}(?:\\{([^}]*?)\\})?`);
  const match = tex.match(re);
  if (!match) return null;
  // Combine if two args (e.g. \name{First}{Last})
  const parts = [match[1], match[2]].filter(Boolean);
  const result = parts.join(" ").trim();
  if (isPlaceholder(result)) return null;
  return result;
}

function extractHrefTargets(tex: string): { linkedin: string | null; github: string | null } {
  let linkedin: string | null = null;
  let github: string | null = null;

  const hrefMatches = tex.matchAll(/\\href\{([^}]+)\}/g);
  for (const match of hrefMatches) {
    const url = match[1];
    if (url.includes("linkedin.com")) linkedin = url;
    if (url.includes("github.com")) github = url;
  }

  return { linkedin, github };
}

function extractSection(tex: string, sectionName: string): string | null {
  // Find \section{Name} and extract content until next \section or \end{document}
  const sectionRe = new RegExp(
    `\\\\section\\{${sectionName}\\}([\\s\\S]*?)(?=\\\\section\\{|\\\\end\\{document\\})`,
    "i",
  );
  const match = tex.match(sectionRe);
  return match?.[1] ?? null;
}

function extractCvEntries(tex: string): Array<{
  dates: string;
  title: string;
  institution: string;
  location: string;
  description: string;
}> {
  const entries: Array<{
    dates: string;
    title: string;
    institution: string;
    location: string;
    description: string;
  }> = [];

  // Match \cventry{dates}{title}{institution}{location}{unused}{description}
  const entryRe =
    /\\cventry\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{/g;
  let match;
  while ((match = entryRe.exec(tex)) !== null) {
    entries.push({
      dates: match[1].trim(),
      title: match[2].trim(),
      institution: match[3].trim(),
      location: match[4].trim(),
      description: match[6]?.trim() ?? "",
    });
  }

  return entries;
}

function extractItems(tex: string): string[] {
  const items: string[] = [];
  const itemRe = /\\item\s+(.+)/g;
  let match;
  while ((match = itemRe.exec(tex)) !== null) {
    const text = match[1]
      .replace(/\\textbf\{([^}]+)\}/g, "$1")
      .replace(/\\href\{[^}]+\}\{([^}]+)\}/g, "$1")
      .replace(/[{}]/g, "")
      .trim();
    if (text && !isPlaceholder(text)) {
      items.push(text);
    }
  }
  return items;
}

function isPlaceholder(text: string): boolean {
  return /\[[A-Z_]+\]/.test(text);
}

function parseDate(dates: string): {
  start: string | null;
  end: string | null;
} {
  // Handle "YYYY--Present", "YYYY--YYYY", "MM/YYYY--MM/YYYY"
  const parts = dates.split("--").map((s) => s.trim());
  if (parts.length < 2) return { start: parts[0] ?? null, end: null };

  const start = parts[0] || null;
  const end = parts[1]?.toLowerCase() === "present" ? null : parts[1];
  return { start, end };
}

// ─── CV Parsing ───────────────────────────────────────────────────────────

function parseCv(tex: string): CvStaging {
  // Identity
  const firstName = extractCommandArg(tex, "firstname");
  const lastName = extractCommandArg(tex, "lastname");
  const name =
    firstName && lastName
      ? `${firstName} ${lastName}`
      : extractCommandArg(tex, "name") ?? null;
  const email = extractCommandArg(tex, "email");
  const phone = extractCommandArg(tex, "phone");
  const { linkedin, github } = extractHrefTargets(tex);

  // Location from \address
  const addressMatch = tex.match(/\\address\{([^}]+)\}/);
  const location = addressMatch?.[1]?.trim() ?? null;

  // Sections
  const educationSection = extractSection(tex, "Education");
  const experienceSection = extractSection(tex, "Professional Experience");
  const skillsSection = extractSection(tex, "Core Competencies");
  const languagesSection = extractSection(tex, "Languages");
  const publicationsSection = extractSection(tex, "Publications");
  const awardsSection = extractSection(tex, "Honors and Awards");

  // Education entries
  const education: CvStaging["education"] = [];
  if (educationSection) {
    const entries = extractCvEntries(educationSection);
    for (const entry of entries) {
      const { start, end } = parseDate(entry.dates);
      const degreeField = entry.title.split(" in ");
      const degree = degreeField[0]?.trim() ?? entry.title;
      const field = degreeField.slice(1).join(" in ").trim() ?? "";

      const thesisMatch = entry.description.match(
        /[Tt]his[is]*[:\s]+["""]([^"""]+)["""]/,
      );

      education.push({
        degree,
        field,
        institution: entry.institution,
        location: entry.location || null,
        startYear: start ? parseInt(start) || null : null,
        endYear: end ? parseInt(end) || null : null,
        thesis: thesisMatch?.[1] ?? null,
      });
    }
  }

  // Experience entries
  const experience: CvStaging["experience"] = [];
  if (experienceSection) {
    const entries = extractCvEntries(experienceSection);
    for (const entry of entries) {
      const { start, end } = parseDate(entry.dates);
      const bullets = extractItems(entry.description);
      experience.push({
        title: entry.title,
        company: entry.institution,
        location: entry.location || null,
        startDate: start,
        endDate: end,
        bullets,
      });
    }
  }

  // Skills
  const skills: string[] = [];
  if (skillsSection) {
    const items = extractItems(skillsSection);
    skills.push(...items);
  }

  // Languages
  const languages: string[] = [];
  if (languagesSection) {
    const langText = languagesSection
      .replace(/\\item/g, "")
      .replace(/[{}]/g, "")
      .trim();
    const langParts = langText.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    languages.push(...langParts);
  }

  // Publications
  const publications: CvStaging["publications"] = [];
  if (publicationsSection) {
    const items = extractItems(publicationsSection);
    publications.push(...items.map((text) => ({ text })));
  }

  // Awards
  const awards: CvStaging["awards"] = [];
  if (awardsSection) {
    const items = extractItems(awardsSection);
    awards.push(...items.map((text) => ({ text })));
  }

  return {
    identity: { name, email, phone, linkedin, github, location },
    education,
    experience,
    skills,
    languages,
    publications,
    awards,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────

export function main(): number {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help || flags.h) {
    process.stdout.write(HELP);
    return 0;
  }

  if (flags.version || flags.v) {
    process.stdout.write(`parse-cv version ${VERSION}\n`);
    return 0;
  }

  const cvPath = flags._[0];
  if (!cvPath) {
    process.stderr.write(
      JSON.stringify({
        error: "Provide a .tex CV file path as argument",
        code: "NO_PATH",
      }) + "\n",
    );
    return 1;
  }

  // Read file
  let tex: string;
  try {
    tex = readFileSync(cvPath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      JSON.stringify({ error: `Cannot read file: ${msg}`, code: "READ_ERROR" }) +
        "\n",
    );
    return 1;
  }

  // Parse
  const data = parseCv(tex);

  // Write staging
  const outPath = flags.output ?? join(STAGING_DIR, "cv.json");
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n");

  // Summary
  process.stdout.write(
    JSON.stringify(
      {
        source: "cv",
        file: cvPath,
        name: data.identity.name,
        experience: data.experience.length,
        education: data.education.length,
        skills: data.skills.length,
        output: outPath,
      },
      null,
      2,
    ) + "\n",
  );

  return 0;
}

if (import.meta.main) process.exit(main());
