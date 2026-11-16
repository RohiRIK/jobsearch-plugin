#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { z } from "zod";
import { readStdin } from "../../src/stdin.js";
import { GENERIC_SKILL_TERMS, SKILL_TERMS, aliasGroupFor } from "../../src/skill-vocabulary.js";
export { SKILL_TERMS } from "../../src/skill-vocabulary.js";

export const RequirementSection = z.enum(["title", "required", "responsibilities", "other", "nice-to-have"]);
export type RequirementSection = z.infer<typeof RequirementSection>;

/**
 * One recognised requirement, ranked by where the posting puts it. Rank 1 is
 * the most important: the section it sits in (title > requirements >
 * responsibilities > other text > nice-to-have) decides first, then its first
 * position in the ad. Broad umbrella terms ("cloud", "security") get half
 * weight so they rank below specific requirements in the same section.
 */
export const RankedRequirement = z.object({
  term: z.string(),
  rank: z.number().int().min(1),
  weight: z.number().min(0).max(1),
  section: RequirementSection,
  required: z.boolean(),
  generic: z.boolean(),
  /** Character offset of the occurrence that set the section; -1 when only the title override names it. */
  position: z.number().int().min(-1),
  /** The posting line the requirement came from, trimmed. Untrusted posting text. */
  quote: z.string(),
});
export type RankedRequirement = z.infer<typeof RankedRequirement>;

export const SECTION_WEIGHT: Record<RequirementSection, number> = {
  title: 1,
  required: 0.8,
  responsibilities: 0.6,
  other: 0.5,
  "nice-to-have": 0.3,
};

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
  /** Required skills in rank order (most important first), not vocabulary order. */
  requiredSkills: z.array(z.string()),
  /** Nice-to-have skills in rank order. */
  niceToHaveSkills: z.array(z.string()),
  /** Every recognised requirement with rank, weight, section and source line. Older parsed JSON has none. */
  requirements: z.array(RankedRequirement).default([]),
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
const RESPONSIBILITIES_SECTION = /responsibilit|what you.?ll do|what you will do|your role|the role|in this role|day.to.day|duties|תחומי אחריות|תיאור התפקיד/i;
/** A section heading is a short line; a long sentence that mentions "preferred" is content. */
const HEADING_MAX_LENGTH = 60;

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

interface TermOccurrence {
  term: string;
  start: number;
  end: number;
  line: number;
}

function termPattern(term: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])(${term.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")})(?=[^a-z0-9]|$)`, "gi");
}

/** Index of the line containing `offset`: the last line start at or before it. `lineStarts` is ascending. */
function lineIndexAt(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function termOccurrences(lower: string, lineStarts: number[], term: string): TermOccurrence[] {
  const occurrences: TermOccurrence[] = [];
  for (const match of lower.matchAll(termPattern(term))) {
    const start = (match.index ?? 0) + match[1].length;
    // Binary search, not a walk from line 0: posting text is untrusted and a
    // linear walk per match is quadratic on a crafted ad.
    occurrences.push({ term, start, end: start + match[2].length, line: lineIndexAt(lineStarts, start) });
  }
  return occurrences;
}

/**
 * Drop every occurrence that sits inside a strictly longer occurrence
 * ("endpoint" inside "defender for endpoint"). Sorted by start ascending, then
 * length descending, every strictly longer occurrence that contains another is
 * visited before it, so one sweep tracking the furthest end replaces the
 * all-pairs check. Occurrences with an identical span never hide each other.
 * Returns the survivors in their original order.
 */
function standaloneOccurrences(all: TermOccurrence[]): TermOccurrence[] {
  const order = all.map((_, index) => index);
  order.sort((a, b) => all[a].start - all[b].start || (all[b].end - all[b].start) - (all[a].end - all[a].start));
  const contained = new Uint8Array(all.length);
  let furthestEnd = -1;
  for (let i = 0; i < order.length; ) {
    const { start, end } = all[order[i]];
    let j = i;
    while (j < order.length && all[order[j]].start === start && all[order[j]].end === end) j++;
    const hidden = furthestEnd >= end;
    for (let k = i; k < j; k++) if (hidden) contained[order[k]] = 1;
    if (end > furthestEnd) furthestEnd = end;
    i = j;
  }
  return all.filter((_, index) => contained[index] === 0);
}

/** Label every line with the posting section it sits in. */
function labelSections(lines: string[]): Array<Exclude<RequirementSection, "title">> {
  let section: Exclude<RequirementSection, "title"> = "other";
  return lines.map((line) => {
    const trimmed = line.trim();
    const heading = trimmed.length > 0 && trimmed.length <= HEADING_MAX_LENGTH;
    if (heading && NICE_SECTION.test(trimmed)) section = "nice-to-have";
    else if (REQUIRED_SECTION.test(line)) section = "required";
    else if (heading && RESPONSIBILITIES_SECTION.test(trimmed)) section = "responsibilities";
    else if (heading && NON_REQUIREMENT_SECTION.test(trimmed)) section = "other";
    return section;
  });
}

/**
 * Recognise vocabulary terms, classify each as required or nice-to-have, and
 * rank them by section and position in the ad.
 *
 * Classification is unchanged from v1: a term is nice-to-have when it appears
 * in the nice-to-have block and not in the requirements block. What changed:
 * - Order follows the posting, not the vocabulary list (AUDIT.md F1).
 * - A term that only appears inside a longer recognised term is dropped
 *   ("Defender for Endpoint" is one requirement, not also "endpoint").
 * - Terms in one alias group collapse to the highest-ranked spelling
 *   ("Entra ID (Azure AD)" is one requirement).
 */
export function extractRequirements(
  text: string,
  title?: string,
): { requirements: RankedRequirement[]; requiredSkills: string[]; niceToHaveSkills: string[] } {
  const lower = text.toLowerCase();
  const lines = text.split(/\r?\n/);
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    // split() drops the separator; account for "\r\n" as well as "\n".
    offset += line.length + (text.charAt(offset + line.length) === "\r" ? 2 : 1);
  }

  let niceStart = -1;
  let requiredStart = -1;
  lines.forEach((line, i) => {
    if (requiredStart === -1 && REQUIRED_SECTION.test(line)) requiredStart = i;
    if (niceStart === -1 && NICE_SECTION.test(line)) niceStart = i;
  });
  const inNiceBlock = (line: number) => niceStart >= 0 && line >= niceStart && (niceStart >= requiredStart || line < requiredStart);
  const inRequiredBlock = (line: number) => requiredStart >= 0 && line >= requiredStart && (niceStart <= requiredStart || line < niceStart);
  const sections = labelSections(lines);

  const all: TermOccurrence[] = [];
  for (const term of SKILL_TERMS) {
    // SWIFT (all caps) is a banking network/standard, not the Apple language.
    // Keep the language signal case-sensitive so governance postings do not get
    // a fabricated mobile-development requirement from a compliance acronym.
    if (term === "swift" && !/\bSwift\b/.test(text)) continue;
    all.push(...termOccurrences(lower, lineStarts, term));
  }
  const byTerm = new Map<string, TermOccurrence[]>();
  for (const occurrence of standaloneOccurrences(all)) {
    const group = byTerm.get(occurrence.term);
    if (group) group.push(occurrence);
    else byTerm.set(occurrence.term, [occurrence]);
  }

  const titleLower = (title ?? "").toLowerCase();
  const candidates: Array<Omit<RankedRequirement, "rank"> & { group: string }> = [];
  for (const term of SKILL_TERMS) {
    const occurrences = byTerm.get(term);
    if (!occurrences) continue;
    const nice = occurrences.some((occurrence) => inNiceBlock(occurrence.line)) && !occurrences.some((occurrence) => inRequiredBlock(occurrence.line));
    const generic = GENERIC_SKILL_TERMS.has(term);
    const source = nice
      ? (occurrences.find((occurrence) => inNiceBlock(occurrence.line)) ?? occurrences[0])
      : (occurrences.find((occurrence) => inRequiredBlock(occurrence.line)) ?? occurrences.find((occurrence) => !inNiceBlock(occurrence.line)) ?? occurrences[0]);
    let section: RequirementSection;
    if (nice) section = "nice-to-have";
    else if (titleLower && termOccurrences(titleLower, [0], term).length > 0) section = "title";
    else if (inRequiredBlock(source.line)) section = "required";
    else section = sections[source.line] === "nice-to-have" ? "other" : sections[source.line];
    const weight = Math.round(SECTION_WEIGHT[section] * (generic ? 0.5 : 1) * 100) / 100;
    candidates.push({
      term,
      weight,
      section,
      required: !nice,
      generic,
      position: source.start,
      quote: lines[source.line].trim().replace(/^[-*•·\s]+/, "").slice(0, 200),
      group: aliasGroupFor(term)?.key ?? term,
    });
  }

  candidates.sort((a, b) => b.weight - a.weight || Number(b.required) - Number(a.required) || a.position - b.position);
  const seenGroups = new Set<string>();
  const requirements: RankedRequirement[] = [];
  for (const { group, ...candidate } of candidates) {
    if (seenGroups.has(group)) continue;
    seenGroups.add(group);
    requirements.push({ ...candidate, rank: requirements.length + 1 });
  }
  return {
    requirements,
    requiredSkills: requirements.filter((requirement) => requirement.required).map((requirement) => requirement.term),
    niceToHaveSkills: requirements.filter((requirement) => !requirement.required).map((requirement) => requirement.term),
  };
}

export function summarizeText(text: string, overrides?: { title?: string; company?: string; location?: string }): ParsedJD {
  const lower = text.toLowerCase();
  const lines = text.split(/\r?\n/);
  const { requirements, requiredSkills, niceToHaveSkills } = extractRequirements(text, overrides?.title ?? inferHeading(text).title);

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
    requirements,
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
  requiredSkills, niceToHaveSkills, requirements, languages, education, salary }
  requiredSkills / niceToHaveSkills are in rank order. requirements[] carries
  { term, rank, weight, section, required, generic, position, quote }: rank 1 is
  the most important (section first: title > requirements > responsibilities >
  other > nice-to-have, then position in the ad).
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
