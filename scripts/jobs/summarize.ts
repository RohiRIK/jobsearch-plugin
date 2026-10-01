#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { z } from "zod";
import { readStdin } from "../../src/stdin.js";
import { SKILL_TERMS } from "../../src/skill-vocabulary.js";
export { SKILL_TERMS } from "../../src/skill-vocabulary.js";

export const ParsedJD = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  remote: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  /** Explicit office-day count only; null means the JD did not state one. */
  officeDaysPerWeek: z.number().int().min(0).max(7).nullable().default(null),
  /** An explicit current-residency constraint; null when the JD does not state one. */
  residencyRequirement: z.string().nullable().default(null),
  yearsExperience: z.number().nullable(),
  requiredSkills: z.array(z.string()),
  niceToHaveSkills: z.array(z.string()),
  /** Explicit language requirements only; benefit copy does not create a gap. */
  niceToHaveLanguages: z.array(z.string()).default([]),
  languages: z.array(z.string()),
  education: z.string().nullable(),
  salary: z.string().nullable(),
});

export type ParsedJD = z.infer<typeof ParsedJD>;

const LANGUAGE_TERMS: Record<string, RegExp> = {
  english: /\benglish\b|אנגלית/i,
  hebrew: /\bhebrew\b|עברית/i,
  danish: /\bdanish\b|dansk/i,
  dutch: /\bdutch\b|nederlands/i,
  german: /\bgerman\b|deutsch/i,
  french: /\bfrench\b/i,
};

const NICE_SECTION = /nice.to.have|advantages?|preferred|bonus|plus\b|would be a plus|יתרון/i;
const REQUIRED_SECTION = /requirements?|qualifications?|must.have|what you.?ll need|what you.?ll bring|we expect|דרישות/i;
const NON_REQUIREMENT_SECTION = /what we offer|benefits?|about (?:the|this)|who we are|equal opportunit/i;

const LABEL_TITLE = /^\s*(?:role|title|position|job title)\s*:\s*(.+)$/i;
const LABEL_COMPANY = /^\s*(?:company|employer|organisation|organization)\s*:\s*(.+)$/i;
const LABEL_LOCATION = /^\s*(?:location|work location)\s*:\s*(.+)$/i;

/**
 * Infer title and company from a posting's heading lines.
 *
 * Postings arrive in three observed shapes: labelled ("Company: X" / "Role: Y"),
 * LinkedIn-style (title on line 1, "Company · Location" on line 2), and
 * dash-joined ("Title — Company"). Without this, `title`/`company` stay undefined
 * for every file-based run and sector scoring silently falls back to neutral.
 */
export function inferHeading(text: string): { title?: string; company?: string; location?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0).slice(0, 8);
  if (lines.length === 0) return {};

  let title: string | undefined;
  let company: string | undefined;
  let location: string | undefined;

  for (const line of lines) {
    const t = line.match(LABEL_TITLE);
    if (t && !title) title = t[1].trim();
    const c = line.match(LABEL_COMPANY);
    if (c && !company) company = c[1].trim();
    const l = line.match(LABEL_LOCATION);
    if (l && !location) location = l[1].trim();
  }
  if (title && company && location) return { title, company, location };

  const first = lines[0];
  // "Title — Company". Em/en-dash only: a plain hyphen is too often part of the
  // title itself ("IT Specialist - Infrastructure and Cyber Security").
  const dashed = first.match(/^(.{3,120}?)\s+[—–]\s+(.{2,80})$/);
  if (!title && !company && dashed) {
    return { title: dashed[1].trim(), company: dashed[2].trim() };
  }

  // LinkedIn shape: title on line 1, "Company · Location" on line 2.
  if (!title && first.length <= 140 && !LABEL_COMPANY.test(first)) title = first;
  if (!company && lines[1]) {
    const second = lines[1];
    const dot = second.split(/\s*·\s*/);
    if (dot.length >= 2 && dot[0].length <= 80) {
      company = dot[0].trim();
      if (!location) location = dot[1].trim();
    }
  }

  return { title, company, location };
}

function extractLanguageSignals(lines: string[]): { required: string[]; niceToHave: string[] } {
  const required = new Set<string>();
  const niceToHave = new Set<string>();
  let section: "required" | "nice" | "unknown" = "unknown";
  const requiredCue = /\b(required|must|mandatory|fluen(?:cy|t)|proficien(?:cy|t)|working language)\b/i;
  const niceCue = /\b(plus|preferred|bonus|advantage)\b/i;

  for (const line of lines) {
    if (REQUIRED_SECTION.test(line)) section = "required";
    else if (NICE_SECTION.test(line)) section = "nice";
    else if (NON_REQUIREMENT_SECTION.test(line)) section = "unknown";

    for (const [language, expression] of Object.entries(LANGUAGE_TERMS)) {
      const contexts = [...line.matchAll(new RegExp(expression.source, "gi"))]
        .map((match) => line.slice(Math.max(0, (match.index ?? 0) - 30), (match.index ?? 0) + match[0].length + 30));
      for (const context of contexts) {
        if (niceCue.test(context)) niceToHave.add(language);
        else if (requiredCue.test(context) || section === "required") required.add(language);
        else if (section === "nice") niceToHave.add(language);
      }
    }
  }
  for (const language of required) niceToHave.delete(language);
  return { required: [...required], niceToHave: [...niceToHave] };
}

export function summarizeText(text: string, overrides?: { title?: string; company?: string; location?: string }): ParsedJD {
  const lower = text.toLowerCase();
  const lines = text.split(/\r?\n/);

  let niceStart = -1;
  let requiredStart = -1;
  lines.forEach((line, i) => {
    if (requiredStart === -1 && REQUIRED_SECTION.test(line)) requiredStart = i;
    if (niceStart === -1 && NICE_SECTION.test(line)) niceStart = i;
  });

  const niceText =
    niceStart >= 0
      ? lines.slice(niceStart, niceStart < requiredStart ? requiredStart : undefined).join("\n").toLowerCase()
      : "";

  const requiredSkills: string[] = [];
  const niceToHaveSkills: string[] = [];
  for (const term of SKILL_TERMS) {
    // SWIFT (all caps) is a banking network/standard, not the Apple language.
    // Keep the language signal case-sensitive so governance postings do not get
    // a fabricated mobile-development requirement from a compliance acronym.
    if (term === "swift" && !/\bSwift\b/.test(text)) continue;
    const pattern = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    if (!pattern.test(lower)) continue;
    if (niceText && pattern.test(niceText) && !(requiredStart >= 0 && pattern.test(lines.slice(requiredStart, niceStart > requiredStart ? niceStart : undefined).join("\n").toLowerCase()))) {
      niceToHaveSkills.push(term);
    } else {
      requiredSkills.push(term);
    }
  }

  const yearsMatch = lower.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)|(?:שנות|שנים).{0,10}?(\d{1,2})|(\d{1,2}).{0,10}?(?:שנות|שנים)/);
  const yearsExperience = yearsMatch ? parseInt(yearsMatch[1] ?? yearsMatch[2] ?? yearsMatch[3], 10) : null;

  const languageSignals = extractLanguageSignals(lines);
  const languages = languageSignals.required;
  const niceToHaveLanguages = languageSignals.niceToHave;

  const remote = /fully remote|100% remote|\bremote\b|מרחוק/i.test(text)
    ? /hybrid|היברידי/i.test(text)
      ? "hybrid"
      : "remote"
    : /hybrid|היברידי/i.test(text)
      ? "hybrid"
      : /on.?site|office|במשרד/i.test(text)
        ? "onsite"
        : "unknown";

  const eduMatch = text.match(/(?:B\.?Sc\.?|M\.?Sc\.?|Bachelor'?s?|Master'?s?|Ph\.?D\.?|degree in [A-Za-z ]+|תואר (?:ראשון|שני))/i);
  const salaryMatch = text.match(/(?:₪|\$|€|DKK|USD|ILS|NIS)\s?[\d,]{4,}(?:\s?-\s?(?:₪|\$|€)?[\d,]{4,})?(?:\s*(?:per|\/)\s*(?:month|year|hour|annum))?/i);

  const inferred = inferHeading(text);
  const officeDayWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const officeDaysMatch = lower.match(/\b([1-7]|one|two|three|four|five)\s+days?\s*(?:per|a|\/)\s*week\b.{0,50}\b(?:in[- ]?office|on[- ]?site|office|in person)\b|\b(?:in[- ]?office|on[- ]?site|office|in person)\b.{0,50}\b([1-7]|one|two|three|four|five)\s+days?\s*(?:per|a|\/)\s*week\b/i);
  const officeDaysToken = officeDaysMatch?.[1] ?? officeDaysMatch?.[2];
  const officeDaysPerWeek = officeDaysToken
    ? (officeDayWords[officeDaysToken.toLowerCase()] ?? Number.parseInt(officeDaysToken, 10))
    : null;
  const residencyMatch = text.match(/\b(?:must|need to|required to)\s+(?:currently\s+)?reside\s+in\s+([^.;*\n<]{2,100})/i);
  const residencyRequirement = residencyMatch?.[1]?.trim() || null;

  return ParsedJD.parse({
    title: overrides?.title ?? inferred.title,
    company: overrides?.company ?? inferred.company,
    location: overrides?.location ?? inferred.location,
    remote,
    officeDaysPerWeek,
    residencyRequirement,
    yearsExperience,
    requiredSkills,
    niceToHaveSkills,
    niceToHaveLanguages,
    languages,
    education: eduMatch ? eduMatch[0] : null,
    salary: salaryMatch ? salaryMatch[0] : null,
  });
}

const HELP = `summarize — Parse a raw job description into structured JSON

USAGE
  bun run scripts/jobs/summarize.ts --input <file> [flags]
  cat job.txt | bun run scripts/jobs/summarize.ts

FLAGS
  --help, -h            Show this help message
  --input, -i <file>    Read job description from file (default: stdin)
  --title <text>        Job title override
  --company <text>      Company name override
  --location <text>     Location override

OUTPUT
  JSON to stdout: { title, company, location, remote, officeDaysPerWeek, residencyRequirement, yearsExperience,
  requiredSkills, niceToHaveSkills, languages, education, salary }
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error

NOTES
  Heuristic extraction (keyword dictionary + section detection). For nuanced
  parsing, use the job-application-assistant skill; this tool makes raw text
  machine-usable for score-job.ts.
`;

interface Flags {
  help?: boolean;
  input?: string;
  title?: string;
  company?: string;
  location?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--input" || a === "-i") flags.input = argv[++i];
    else if (a === "--title") flags.title = argv[++i];
    else if (a === "--company") flags.company = argv[++i];
    else if (a === "--location") flags.location = argv[++i];
  }
  return flags;
}

export async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }

  let text: string;
  try {
    if (flags.input) {
      text = readFileSync(flags.input, "utf-8");
    } else if (!process.stdin.isTTY) {
      text = await readStdin();
    } else {
      process.stderr.write(JSON.stringify({ error: "No input. Use --input <file> or pipe text via stdin.", code: "NO_INPUT" }) + "\n");
      return 1;
    }
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err instanceof Error ? err.message : String(err), code: "READ_FAILED" }) + "\n");
    return 1;
  }

  if (text.trim().length === 0) {
    process.stderr.write(JSON.stringify({ error: "Input is empty", code: "EMPTY_INPUT" }) + "\n");
    return 1;
  }

  const parsed = summarizeText(text, { title: flags.title, company: flags.company, location: flags.location });
  process.stdout.write(JSON.stringify(parsed, null, 2) + "\n");
  return 0;
}

if (import.meta.main) main().then((code) => process.exit(code));
