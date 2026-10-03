#!/usr/bin/env bun
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { Profile } from "../../src/profile-schemas.js";
import { professionalExperienceYears } from "../../src/experience.js";
import { matchProfileSkill, type SkillMatchType } from "../../src/skill-vocabulary.js";
import { readStdin } from "../../src/stdin.js";
import { ParsedJD, summarizeText } from "../jobs/summarize.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";

const PROFILE_PATH = join(ROOT, "data", "profile.json");
const MATCHES_DIR = join(ROOT, "data", "matches");

export interface ScoreBreakdown {
  skills: number;
  experience: number;
  sector: number;
  location: number;
  language: number;
}

export interface SkillEvidence {
  requirement: string;
  profileSkill: string;
  matchType: SkillMatchType;
}

export interface EligibilityResult {
  status: "eligible" | "ineligible" | "review";
  constraints: string[];
}

export interface MatchResult {
  score: number;
  breakdown: ScoreBreakdown;
  gaps: string[];
  matched: string[];
  neutral: string[];
  skillEvidence: SkillEvidence[];
  eligibility: EligibilityResult;
  jd: ParsedJD;
}

function flattenProfileSkills(profile: Profile): string[] {
  return (profile.skills ?? []).flatMap((category) => category.skills);
}

function findProfileSkillEvidence(requirement: string, profileSkills: string[]): SkillEvidence | null {
  for (const profileSkill of profileSkills) {
    const matchType = matchProfileSkill(requirement, profileSkill);
    if (matchType) return { requirement, profileSkill, matchType };
  }
  return null;
}

function sectorMatchesPosting(sector: string, jdTitleAndCompany: string): boolean {
  if (jdTitleAndCompany.includes(sector)) return true;
  // These target labels are singular profile taxonomy while employers often use
  // a pluralized title or the product-specific "Cloud SIEM" wording.
  if (sector === "solution engineer") return /\bsolutions? engineer\b|\bpre-?sales\b/.test(jdTitleAndCompany);
  if (sector === "cloud security") return /\bcloud security\b|\bcloud siem\b/.test(jdTitleAndCompany);
  return false;
}

export function scoreJob(jd: ParsedJD, profile: Profile): MatchResult {
  const gaps: string[] = [];
  const matched: string[] = [];
  const neutral: string[] = [];
  const skillEvidence: SkillEvidence[] = [];
  const profileSkills = flattenProfileSkills(profile);

  let skills: number;
  const allRequired = jd.requiredSkills.map((s) => s.toLowerCase());
  if (allRequired.length === 0) {
    skills = 20;
    neutral.push("skills: JD lists no recognizable skills — neutral 20/40");
  } else {
    const requiredEvidence = allRequired.map((requirement) => findProfileSkillEvidence(requirement, profileSkills));
    const hits = allRequired.filter((_, index) => requiredEvidence[index] !== null);
    const misses = allRequired.filter((_, index) => requiredEvidence[index] === null);
    const niceEvidence = jd.niceToHaveSkills.map((requirement) => findProfileSkillEvidence(requirement, profileSkills));
    const niceHits = jd.niceToHaveSkills.filter((_, index) => niceEvidence[index] !== null);
    skillEvidence.push(
      ...requiredEvidence.filter((evidence): evidence is SkillEvidence => evidence !== null),
      ...niceEvidence.filter((evidence): evidence is SkillEvidence => evidence !== null),
    );
    skills = Math.round((hits.length / allRequired.length) * 36 + Math.min(niceHits.length, 4));
    matched.push(...hits, ...niceHits.map((s) => `${s} (nice-to-have)`));
    gaps.push(...misses);
  }

  let experience: number;
  const years = professionalExperienceYears(profile.experience);
  if (jd.yearsExperience === null) {
    experience = 15;
    neutral.push("experience: JD states no year requirement — neutral 15/25");
  } else if (years === null) {
    experience = 12;
    neutral.push("experience: profile has no dated experience entries — neutral 12/25");
  } else if (years >= jd.yearsExperience) {
    experience = 25;
    matched.push(`${years}y experience >= required ${jd.yearsExperience}y`);
  } else {
    experience = Math.round((years / jd.yearsExperience) * 25);
    gaps.push(`experience: ${years}y < required ${jd.yearsExperience}y`);
  }

  let sector: number;
  const sectors = (profile.targetSectors ?? []).flatMap((s) => [s.sector.toLowerCase(), ...s.companies.map((c) => c.toLowerCase())]);
  const jdText = `${jd.title ?? ""} ${jd.company ?? ""}`.toLowerCase();
  if (sectors.length === 0 || jdText.trim().length === 0) {
    sector = 8;
    neutral.push("sector: no target sectors in profile or no title/company in JD — neutral 8/15");
  } else if (sectors.some((sector) => sectorMatchesPosting(sector, jdText))) {
    sector = 15;
    matched.push("target sector/company match");
  } else {
    sector = 5;
    gaps.push("sector: not in profile target sectors");
  }

  const preferences = profile.workPreferences;
  const eligibility: EligibilityResult = { status: "eligible", constraints: [] };
  if (!preferences) {
    eligibility.status = "review";
    eligibility.constraints.push("work preferences: profile has no structured work-preference policy");
  } else if (jd.remote === "onsite") {
    if (jd.officeDaysPerWeek === null) {
      eligibility.status = "review";
      eligibility.constraints.push("work arrangement: on-site role without an explicit office-day count");
    } else if (preferences.maxOfficeDaysPerWeek === undefined) {
      eligibility.status = "review";
      eligibility.constraints.push(`work arrangement: JD requires ${jd.officeDaysPerWeek} office days/week; profile states no maximum`);
    } else if (jd.officeDaysPerWeek > preferences.maxOfficeDaysPerWeek) {
      eligibility.status = "ineligible";
      eligibility.constraints.push(
        `deal-breaker: JD requires ${jd.officeDaysPerWeek} office days/week; profile maximum is ${preferences.maxOfficeDaysPerWeek}`,
      );
    }
  } else if (jd.remote === "remote" && !preferences.remote) {
    eligibility.status = "ineligible";
    eligibility.constraints.push("deal-breaker: profile does not accept remote work");
  } else if (jd.remote === "hybrid" && !preferences.hybrid) {
    eligibility.status = "ineligible";
    eligibility.constraints.push("deal-breaker: profile does not accept hybrid work");
  }
  if (jd.residencyRequirement && eligibility.status !== "ineligible") {
    eligibility.status = "review";
    eligibility.constraints.push(`residency requirement: JD requires current residence in ${jd.residencyRequirement}`);
  }

  let location: number;
  const profileLocation = `${profile.identity.location ?? ""} ${profile.identity.country ?? ""}`.toLowerCase().trim();
  if (eligibility.status === "ineligible") {
    location = 0;
    gaps.push(...eligibility.constraints);
  } else if (jd.remote === "remote") {
    location = 10;
    matched.push("remote work accepted");
  } else if (jd.remote === "hybrid" && preferences?.hybrid) {
    location = 8;
    matched.push("hybrid work accepted");
  } else if (!jd.location || profileLocation.length === 0) {
    location = 5;
    neutral.push("location: missing JD location or profile location — neutral 5/10");
  } else if (profileLocation.includes(jd.location.toLowerCase()) || jd.location.toLowerCase().includes(profileLocation.split(",")[0])) {
    location = 10;
    matched.push(`location match: ${jd.location}`);
  } else if (preferences?.relocation) {
    location = 6;
    matched.push(`relocation considered: ${jd.location}`);
  } else {
    location = jd.remote === "hybrid" ? 4 : 2;
    gaps.push(`location: ${jd.location} vs profile ${profileLocation || "unknown"}`);
  }

  let language: number;
  const profileLangs = (profile.identity.languages ?? []).map((l) => l.toLowerCase());
  if (jd.languages.length === 0) {
    language = 7;
    neutral.push("language: JD states no language requirement — neutral 7/10");
  } else if (profileLangs.length === 0) {
    language = 5;
    neutral.push("language: profile lists no spoken languages — neutral 5/10");
  } else {
    const langHits = jd.languages.filter((l) => profileLangs.some((p) => p.includes(l)));
    language = Math.round((langHits.length / jd.languages.length) * 10);
    if (langHits.length < jd.languages.length) {
      gaps.push(`languages missing: ${jd.languages.filter((l) => !langHits.includes(l)).join(", ")}`);
    } else {
      matched.push(`languages: ${langHits.join(", ")}`);
    }
  }

  const breakdown: ScoreBreakdown = { skills, experience, sector, location, language };
  const score = skills + experience + sector + location + language;
  return { score, breakdown, gaps, matched, neutral, skillEvidence, eligibility, jd };
}

const HELP = `score-job — Score a job against the candidate profile (0-100)

USAGE
  bun run scripts/match/score-job.ts --input <job.txt|job.json> [flags]
  cat job-description.txt | bun run scripts/match/score-job.ts --company Acme --title "DevOps Engineer"

FLAGS
  --help, -h            Show this help message
  --input, -i <file>    Job description: raw .txt or parsed .json (from summarize.ts)
  --title <text>        Job title (for sector matching + output naming)
  --company <text>      Company name
  --location <text>     Job location
  --save                Write result to data/matches/<slug>.json
  --profile <path>      Custom profile path (default: data/profile.json)

SCORING
  skills 40% · experience 25% · sector 15% · location 10% · language 10%
  Missing data scores neutral (documented in output "neutral" array) — the
  score is honest about what it could not evaluate.

OUTPUT
  JSON to stdout: { score, breakdown, gaps, matched, neutral, skillEvidence, eligibility, jd }
  eligibility is separate from capability score: eligible, ineligible, or review,
  with explicit work-preference constraints when the JD states them.
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error
`;

interface Flags {
  help?: boolean;
  input?: string;
  title?: string;
  company?: string;
  location?: string;
  save?: boolean;
  profile?: string;
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
    else if (a === "--save") flags.save = true;
    else if (a === "--profile") flags.profile = argv[++i];
  }
  return flags;
}

export async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const profilePath = flags.profile ?? PROFILE_PATH;
  if (!existsSync(profilePath)) {
    process.stderr.write(JSON.stringify({ error: `Profile not found: ${profilePath}. Run: bun run profile`, code: "NO_PROFILE" }) + "\n");
    return 1;
  }

  let profile: Profile;
  try {
    const parsed = Profile.safeParse(JSON.parse(readFileSync(profilePath, "utf-8")));
    if (!parsed.success) {
      process.stderr.write(JSON.stringify({ error: "Profile failed validation", details: parsed.error.issues.slice(0, 3), code: "BAD_PROFILE" }) + "\n");
      return 1;
    }
    profile = parsed.data;
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err instanceof Error ? err.message : String(err), code: "BAD_PROFILE" }) + "\n");
    return 1;
  }

  let raw: string;
  try {
    if (flags.input) {
      raw = readFileSync(flags.input, "utf-8");
    } else if (!process.stdin.isTTY) {
      raw = await readStdin();
    } else {
      process.stderr.write(JSON.stringify({ error: "No input. Use --input <file> or pipe text via stdin.", code: "NO_INPUT" }) + "\n");
      return 1;
    }
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err instanceof Error ? err.message : String(err), code: "READ_FAILED" }) + "\n");
    return 1;
  }

  let jd: ParsedJD;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    const parsed = ParsedJD.safeParse(JSON.parse(trimmed));
    if (!parsed.success) {
      process.stderr.write(JSON.stringify({ error: "Input JSON does not match ParsedJD schema", details: parsed.error.issues.slice(0, 3), code: "BAD_JD" }) + "\n");
      return 1;
    }
    jd = { ...parsed.data, title: flags.title ?? parsed.data.title, company: flags.company ?? parsed.data.company, location: flags.location ?? parsed.data.location };
  } else {
    jd = summarizeText(raw, { title: flags.title, company: flags.company, location: flags.location });
  }

  const result = scoreJob(jd, profile);

  if (flags.save) {
    mkdirSync(MATCHES_DIR, { recursive: true });
    const slug = `${jd.company ?? "unknown"}_${jd.title ?? (flags.input ? basename(flags.input) : "job")}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const outPath = join(MATCHES_DIR, `${slug}.json`);
    writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return 0;
}

if (import.meta.main) main().then((code) => process.exit(code));
