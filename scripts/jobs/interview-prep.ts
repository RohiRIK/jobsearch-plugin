#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Profile } from "../../src/profile-schemas.js";
import { summarizeText } from "./summarize.js";
import { scoreJob } from "../match/score-job.js";
import { extractJobSignals } from "../match/template-engine.js";
import { buildApplicationPlan } from "../../src/application-plan.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";

const DEFAULT_PROFILE = join(ROOT, "data", "profile.json");

const HELP = `Interview Prep Engine — heuristic prep sheet from posting + profile.

Usage:
  interview-prep.ts --job <posting file> [options]

Options:
  --job <file>          Job posting file (required)
  --company <name>      Company name override
  --role <title>        Role title override
  --profile <path>      Profile JSON (default: data/profile.json)
  --format <json|text>  Output format (default: json)
  -h, --help            Show this help

Output: technical + behavioral questions, talking points, gap prep,
questions to ask. Heuristic — rehearse and personalize before the interview.
Exit 0/1.`;

interface PrepSheet {
  company: string;
  role: string;
  fitScore: number | null;
  roleThesis: string;
  mustProve: string[];
  evidenceStories: Array<{ evidenceId: string; prompt: string }>;
  technicalQuestions: string[];
  behavioralQuestions: string[];
  talkingPoints: string[];
  gapPrep: Array<{ gap: string; strategy: string }>;
  questionsToAsk: string[];
}

export function buildPrepSheet(posting: string, profile: Profile | null, overrides: { company?: string; role?: string } = {}): PrepSheet {
  const jd = summarizeText(posting, { title: overrides.role, company: overrides.company });
  const signals = extractJobSignals(posting);
  const match = profile ? scoreJob(jd, profile) : null;
  const gaps = match?.gaps ?? [];
  const plan = profile ? buildApplicationPlan({
    profile,
    posting,
    role: overrides.role ?? jd.title ?? "unknown role",
    jd,
    score: match!,
    cvPages: [1, 2],
    educationFirst: false,
  }) : undefined;

  const technicalQuestions = [
    ...(plan?.mustProve ?? jd.requiredSkills).slice(0, 6).map((s) => `Walk me through a real problem you solved with ${s} — what constraint did you face, what did you change, and what result can you prove?`),
    ...(signals.roleType === "technical" ? ["How do you decide what to automate versus handle manually?"] : []),
    ...(signals.certifications.length > 0
      ? [`This role references ${signals.certifications.join(", ")} — how does your certification-level knowledge apply day to day?`]
      : []),
  ];

  const behavioralQuestions = [
    "Tell me about a time you disagreed with a technical decision — what did you do?",
    "Describe a production incident you owned. What changed afterwards?",
    ...(signals.seniority === "senior" || signals.seniority === "lead"
      ? ["Tell me about mentoring someone through a hard problem.", "How do you push back on unrealistic deadlines?"]
      : ["Tell me about the steepest learning curve you have climbed recently."]),
    ...(signals.companySize === "small" ? ["How do you handle wearing multiple hats with little process?"] : []),
  ];

  const evidenceStories = plan?.evidencePriorities
    .filter((priority) => priority.kind === "experience" || priority.kind === "project")
    .slice(0, 5)
    .map((priority) => {
      const decision = plan.projectDecisions.find((item) => `profile:project:${item.slug}` === priority.evidenceId);
      const preparedQuestion = decision?.interviewPrompts[0];
      return {
        evidenceId: priority.evidenceId,
        prompt: preparedQuestion
          ? `${preparedQuestion} Use this evidence: ${priority.evidenceId}. Prepare context, your role, constraints, decision, result, and what you would do differently.`
          : `Prepare a concrete story for ${priority.evidenceId}: context, your role, constraints, decision, result, and what you would do differently.`,
      };
    }) ?? [];
  const talkingPoints = [
    ...evidenceStories.map((story) => story.prompt),
    ...(plan?.projectDecisions.filter((decision) => decision.included).slice(0, 3).map((decision) => `Be ready to explain why ${decision.slug} belongs in this application: ${decision.reason}.`) ?? []),
  ];

  const gapPrep = gaps.slice(0, 6).map((gap) => ({
    gap,
    strategy: `Do not bluff ${gap}. Bridge honestly: name the nearest skill you do have, show how you have crossed similar gaps fast, and if possible skim the ${gap} quickstart the night before.`,
  }));

  const questionsToAsk = [
    "What does success in this role look like after 6 months?",
    "What is the biggest source of toil on the team right now?",
    ...(signals.roleType === "technical" ? ["How does the team decide between building and buying?"] : []),
    ...(signals.companySize === "large" ? ["How do decisions travel between this team and the wider org?"] : []),
    "What made the last person who thrived here stand out?",
  ];

  return {
    company: jd.company ?? overrides.company ?? "unknown",
    role: jd.title ?? overrides.role ?? "unknown role",
    fitScore: match?.score ?? null,
    technicalQuestions,
    behavioralQuestions,
    talkingPoints,
    roleThesis: plan?.roleThesis ?? "Build evidence-backed answers from the profile before making claims.",
    mustProve: plan?.mustProve ?? jd.requiredSkills,
    evidenceStories,
    gapPrep,
    questionsToAsk,
  };
}

function renderText(p: PrepSheet): string {
  const section = (title: string, items: string[]) => (items.length ? `\n${title}\n${items.map((i) => `  - ${i}`).join("\n")}` : "");
  return (
    `Interview prep — ${p.role} at ${p.company}${p.fitScore !== null ? ` (fit ${p.fitScore}/100)` : ""}` +
    section("Role thesis:", [p.roleThesis]) +
    section("What the application must prove:", p.mustProve) +
    section("Evidence stories:", p.evidenceStories.map((story) => `${story.evidenceId}: ${story.prompt}`)) +
    section("Technical questions to rehearse:", p.technicalQuestions) +
    section("Behavioral questions to rehearse:", p.behavioralQuestions) +
    section("Talking points:", p.talkingPoints) +
    section("Gap preparation:", p.gapPrep.map((g) => `${g.gap}: ${g.strategy}`)) +
    section("Questions to ask them:", p.questionsToAsk)
  );
}

export async function main(): Promise<number> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      job: { type: "string" },
      company: { type: "string" },
      role: { type: "string" },
      profile: { type: "string" },
      format: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  if (typeof values.job !== "string") {
    process.stderr.write(JSON.stringify({ error: "missing --job <posting file>", code: "BAD_ARGS" }) + "\n");
    return 1;
  }
  const jobPath = resolve(process.cwd(), values.job);
  if (!existsSync(jobPath)) {
    process.stderr.write(JSON.stringify({ error: `file not found: ${jobPath}`, code: "NOT_FOUND" }) + "\n");
    return 1;
  }

  let profile: Profile | null = null;
  const profilePath = typeof values.profile === "string" ? resolve(process.cwd(), values.profile) : DEFAULT_PROFILE;
  if (existsSync(profilePath)) {
    try {
      profile = Profile.parse(JSON.parse(readFileSync(profilePath, "utf-8")));
    } catch {
      process.stderr.write(JSON.stringify({ warning: `profile at ${profilePath} failed validation — prep without match data` }) + "\n");
    }
  }

  const sheet = buildPrepSheet(readFileSync(jobPath, "utf-8"), profile, {
    company: typeof values.company === "string" ? values.company : undefined,
    role: typeof values.role === "string" ? values.role : undefined,
  });

  if (values.format === "text") {
    process.stdout.write(renderText(sheet) + "\n");
  } else {
    process.stdout.write(JSON.stringify(sheet, null, 2) + "\n");
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
