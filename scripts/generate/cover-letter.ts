#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Profile } from "../../src/profile-schemas.js";
import { buildSourcePath } from "../../src/naming.js";
import { summarizeText } from "../jobs/summarize.js";
import { scoreJob } from "../match/score-job.js";
import { CODE_ROOT, WORKSPACE as ROOT } from "../../src/paths.js";

const DEFAULT_PROFILE = join(ROOT, "data", "profile.json");
const OUT_DIR = join(ROOT, "assets", "applications");

const HELP = `Cover Letter Generator — heuristic draft from profile + job posting.

Usage:
  cover-letter.ts --company <name> --role <title> [options]

Options:
  --company <name>      Company name (required)
  --role <title>        Role title (required)
  --job <file>          Job posting file — enables skill matching and targeting
  --profile <path>      Profile JSON (default: data/profile.json)
  --recipient <name>    Addressee (default: Hiring Manager)
  --template <name>     Cover template (default: classic)
  --out <path>          Output .typ path (default: naming convention via src/naming.ts —
                        assets/cover_letters/<Name>_<Company>_<Role>_CL.typ)
  --compile             Also compile to PDF via typst
  -h, --help            Show this help

Output: JSON { file, compiled, pages, matched, gaps, note }. Exit 0/1.
The draft is heuristic — polish wording with the /apply skill before sending.`;

function typstEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

// ─── Skill Name Helpers ───────────────────────────────────────────────────

/** Strip verbose description after colon — "Entra ID (Azure AD): identity ..." → "Entra ID (Azure AD)" */
function cleanSkillName(name: string): string {
  const colon = name.indexOf(": ");
  return colon > 0 ? name.slice(0, colon).trim() : name.trim();
}

/** Expand common skill abbreviations and phrases into natural language */
function expandSkill(skill: string): string {
  const cleaned = cleanSkillName(skill);
  const lower = cleaned.toLowerCase();
  const expansions: Record<string, string> = {
    "aws and cloud": "cloud platforms (AWS, Azure)",
    "ci/cd": "CI/CD pipelines and DevOps automation",
    // Common abbreviations
    aws: "Amazon Web Services (AWS)",
    gcp: "Google Cloud Platform (GCP)",
    ci: "Continuous Integration",
    cd: "Continuous Delivery",
    iac: "Infrastructure as Code",
    ml: "Machine Learning",
    ai: "Artificial Intelligence",
    nlp: "Natural Language Processing",
  };
  return expansions[lower] ?? cleaned;
}

/** Build a natural English list: "X, Y, and Z" */
function naturalList(items: string[], max: number = 4): string {
  const list = [...new Set(items)].slice(0, max);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  // Oxford comma
  return list.slice(0, -1).join(", ") + ", and " + list[list.length - 1];
}

interface DraftInputs {
  profile: Profile;
  company: string;
  role: string;
  posting: string | null;
}

function summariseSkills(matched: string[], profile: Profile): string {
  const source = matched.length > 0
    ? matched
    : (profile.skills ?? []).flatMap((category) => category.skills);
  const profileSkills = (profile.skills ?? []).flatMap((category) => category.skills);
  return naturalList(
    source
      .map((skill) => skill.replace(/\s+\(nice-to-have\)$/i, ""))
      .map((skill) => {
        const normalized = cleanSkillName(skill).toLowerCase();
        const profileSpelling = profileSkills.find((candidate) => {
          const candidateNormalized = cleanSkillName(candidate).toLowerCase();
          return candidateNormalized === normalized
            || candidateNormalized.includes(normalized)
            || normalized.includes(candidateNormalized);
        });
        return expandSkill(profileSpelling ?? skill);
      })
      .filter(Boolean),
  );
}

function yearFrom(value?: string): number | null {
  const match = value?.match(/\b(?:19|20)\d{2}\b/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function isCurrent(value?: string): boolean {
  return value !== undefined && /present|current|now|ongoing/i.test(value);
}

function mostRecentExperience(profile: Profile): NonNullable<Profile["experience"]>[number] | null {
  const entries = profile.experience ?? [];
  if (entries.length === 0) return null;

  return entries.reduce((latest, entry) => {
    const latestEnd = isCurrent(latest.endDate) ? Number.POSITIVE_INFINITY : (yearFrom(latest.endDate) ?? yearFrom(latest.startDate) ?? 0);
    const entryEnd = isCurrent(entry.endDate) ? Number.POSITIVE_INFINITY : (yearFrom(entry.endDate) ?? yearFrom(entry.startDate) ?? 0);
    if (entryEnd !== latestEnd) return entryEnd > latestEnd ? entry : latest;

    const latestStart = yearFrom(latest.startDate) ?? 0;
    const entryStart = yearFrom(entry.startDate) ?? 0;
    return entryStart > latestStart ? entry : latest;
  });
}

function cleanEvidence(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/[.!?;:]+$/, "");
}

function asFirstPersonSentence(value: string): string {
  const evidence = cleanEvidence(value);
  if (/^I\b/i.test(evidence)) return `${evidence}.`;
  const clause = /^[A-Z][a-z]/.test(evidence)
    ? evidence.charAt(0).toLowerCase() + evidence.slice(1)
    : evidence;
  return `I ${clause}.`;
}

export function draftParagraphs({ profile, company, role, posting }: DraftInputs): {
  paragraphs: string[];
  bullets: string[];
  matched: string[];
  gaps: string[];
} {
  let matched: string[] = [];
  let gaps: string[] = [];

  if (posting) {
    const jd = summarizeText(posting);
    const result = scoreJob(jd, profile);
    matched = result.matched;
    gaps = result.gaps;
  }

  // Only pass actual skill-name matches into the prose summariser — scoreJob()
  // also stuffs meta facts (years of experience, sector match, remote, language)
  // into the same `matched` array, which produced robotic strings like
  // "7y experience >= required 4y" leaking straight into cover letter prose.
  const skillMatches = matched.filter(
    (m) => !/experience|sector\/company match|remote role|^location match|^languages:/i.test(m),
  );
  const skillSummary = summariseSkills(skillMatches, profile);

  const paragraphs: string[] = [];

  paragraphs.push(`I am applying for the ${role} position at ${company}.`);

  if (skillSummary) {
    paragraphs.push(
      posting && skillMatches.length > 0
        ? `The role calls for ${skillSummary}, ${skillMatches.length === 1 ? "a skill" : "skills"} included in my background.`
        : `My background includes ${skillSummary}.`,
    );
  }

  const latest = mostRecentExperience(profile);
  if (latest) {
    const evidence = [
      ...(latest.achievements ?? []),
      ...(latest.responsibilities ?? []),
    ].map(cleanEvidence).filter(Boolean);
    const roleLine = `My most recent role was ${latest.title} at ${latest.company}.`;
    const examples = [...new Set(evidence)].slice(0, 2).map(asFirstPersonSentence).join(" ");
    paragraphs.push(examples ? `${roleLine} ${examples}` : roleLine);
  }

  paragraphs.push(
    `I would welcome the opportunity to discuss how this background could support the team at ${company}. Thank you for your consideration.`,
  );

  return { paragraphs, bullets: [], matched, gaps };
}

export function renderTyp(
  inputs: DraftInputs & { recipient: string; template: string; outDir?: string },
  draft?: ReturnType<typeof draftParagraphs>
): string {
  const { profile, company, role, recipient, template } = inputs;
  const { paragraphs, bullets } = draft ?? draftParagraphs(inputs);
  const id = profile.identity ?? {};
  const date = new Date().toISOString().slice(0, 10);
  const templateImport = relative(inputs.outDir ?? OUT_DIR, join(CODE_ROOT, "templates", "cover", template, "template.typ"));

  const paraList = paragraphs.map((p) => `    "${typstEscape(p)}",`).join("\n");
  const bulletList = bullets.map((b) => `    "${typstEscape(b)}",`).join("\n");

  return `// DRAFT — generated by scripts/generate/cover-letter.ts on ${date}
// Heuristic wording: review and polish with the /apply skill before sending.
#import "${typstEscape(templateImport)}": cover-letter

#show: cover-letter(
  name: "${typstEscape(id.name ?? "")}",
  email: "${typstEscape(id.email ?? "")}",
  phone: "${typstEscape(id.phone ?? "")}",
  linkedin: "${typstEscape(id.linkedin ?? "")}",
  date: "${date}",
  recipient: "${typstEscape(recipient)}",
  company: "${typstEscape(company)}",
  role: "${typstEscape(role)}",
  paragraphs: (
${paraList}
  ),
  bullets: (${bullets.length > 0 ? `\n${bulletList}\n  ` : ""}),
)
`;
}

export async function main(): Promise<number> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      company: { type: "string" },
      role: { type: "string" },
      job: { type: "string" },
      profile: { type: "string" },
      recipient: { type: "string" },
      template: { type: "string" },
      out: { type: "string" },
      compile: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  if (typeof values.company !== "string" || typeof values.role !== "string") {
    process.stderr.write(JSON.stringify({ error: "missing --company and/or --role", code: "BAD_ARGS" }) + "\n");
    return 1;
  }

  const profilePath = typeof values.profile === "string" ? resolve(process.cwd(), values.profile) : DEFAULT_PROFILE;
  if (!existsSync(profilePath)) {
    process.stderr.write(JSON.stringify({ error: `profile not found: ${profilePath}. Run: bun run profile`, code: "NO_PROFILE" }) + "\n");
    return 1;
  }
  let profile: Profile;
  try {
    profile = Profile.parse(JSON.parse(readFileSync(profilePath, "utf-8")));
  } catch (e) {
    process.stderr.write(JSON.stringify({ error: `profile failed validation: ${e}`, code: "BAD_PROFILE" }) + "\n");
    return 1;
  }

  let posting: string | null = null;
  if (typeof values.job === "string") {
    const jobPath = resolve(process.cwd(), values.job);
    if (!existsSync(jobPath)) {
      process.stderr.write(JSON.stringify({ error: `job file not found: ${jobPath}`, code: "NOT_FOUND" }) + "\n");
      return 1;
    }
    posting = readFileSync(jobPath, "utf-8");
  }

  const template = typeof values.template === "string" ? values.template : "classic";
  const templatePath = join(CODE_ROOT, "templates", "cover", template, "template.typ");
  if (!existsSync(templatePath)) {
    process.stderr.write(JSON.stringify({ error: `template '${template}' has no template.typ (stub?)`, code: "NO_TEMPLATE" }) + "\n");
    return 1;
  }

  const recipient = typeof values.recipient === "string" ? values.recipient : "Hiring Manager";
  const outPath =
    typeof values.out === "string"
      ? resolve(process.cwd(), values.out)
      : join(ROOT, buildSourcePath("cl", values.company, values.role));
  const inputs = { profile, company: values.company, role: values.role, posting, recipient, template, outDir: dirname(outPath) };
  const draft = draftParagraphs(inputs);
  const typ = renderTyp(inputs, draft);
  const { matched, gaps } = draft;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, typ);

  let compiled = false;
  let pages: number | null = null;
  if (values.compile) {
    const { compile } = await import("../build/cli.js");
    const result = await compile(outPath);
    compiled = result.status === "success";
    pages = result.pages ?? null;
    if (!compiled) {
      process.stderr.write(JSON.stringify({ error: `compile failed: ${result.error}`, code: "COMPILE_FAIL", file: outPath }) + "\n");
      return 1;
    }
  }

  process.stdout.write(
    JSON.stringify(
      {
        file: outPath.replace(ROOT + "/", ""),
        compiled,
        pages,
        matched,
        gaps,
        note: "heuristic draft — polish wording with the /apply skill before sending",
      },
      null,
      2
    ) + "\n"
  );
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
