/**
 * One-call posting triage: summarize + fit score + market + template + projects.
 *
 * The separate CLIs each echo large payloads (the score result repeats the
 * whole parsed JD; template selection returns every factor of every template).
 * This keeps only what a triage decision needs; `verbose` restores the detail.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Profile } from "../profile-schemas.js";
import { detectMarket, preferredLanguage } from "../market-profiles.js";
import { selectProjects } from "../project-matching.js";
import { summarizeText } from "../../scripts/jobs/summarize.js";
import { scoreJob } from "../../scripts/match/score-job.js";
import { loadRegistry, selectTemplates, type RegistryEntry } from "../../scripts/match/template-engine.js";
import { DATA_DIR, TEMPLATES_DIR, WORKSPACE } from "../paths.js";
import { AgentError } from "./contract.js";

export const DEFAULT_PROFILE = join(DATA_DIR, "profile.json");
export const PHOTO_PATH = join(WORKSPACE, "assets", "photos", "profile.jpg");
const MAX_POSTING_BYTES = 512 * 1024;

export function readPosting(path: string): string {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full) || !statSync(full).isFile()) {
    throw new AgentError("not_found", `posting not found: ${path}`, [`save the posting under ${join(DATA_DIR, "jd")}/ and pass --job <file>`]);
  }
  if (statSync(full).size > MAX_POSTING_BYTES) throw new AgentError("validation", `posting exceeds ${MAX_POSTING_BYTES} bytes: ${path}`);
  const text = readFileSync(full, "utf-8");
  if (text.trim().length === 0) throw new AgentError("validation", `posting is empty: ${path}`);
  return text;
}

export function profilePath(path: string | undefined): string {
  return path ? resolve(process.cwd(), path) : DEFAULT_PROFILE;
}

export function loadProfile(path: string | undefined): Profile {
  const full = profilePath(path);
  if (!existsSync(full)) {
    throw new AgentError("not_found", `profile not found: ${full}`, ["jobsearch status", "bun run profile:scaffold (in a checkout)"]);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(full, "utf-8"));
  } catch (err) {
    throw new AgentError("validation", `profile is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const parsed = Profile.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AgentError("validation", `profile failed validation at ${issue?.path.join(".") || "<root>"}: ${issue?.message}`);
  }
  return parsed.data;
}

/**
 * The template registry, or a loud failure. A bundled build that cannot find
 * its templates used to return `templates.cv: null` with no warning — a quiet
 * wrong answer. Now it is an error the agent can act on.
 */
export function loadTemplates(dir: string = TEMPLATES_DIR): RegistryEntry[] {
  const registry = existsSync(dir) ? loadRegistry(dir) : [];
  if (registry.length === 0) {
    throw new AgentError("unavailable", `no CV/cover templates found in ${dir}`, ["reinstall the plugin, or set JOB_SEARCH_PLUGIN_ROOT to a directory containing templates/"]);
  }
  return registry;
}

type Eligibility = "eligible" | "ineligible" | "review";

export function triagePosting(
  posting: string,
  profile: Profile,
  registry: RegistryEntry[],
  options: { title?: string; company?: string; location?: string; verbose?: boolean; photoAvailable?: boolean; jobPath?: string } = {},
) {
  const jd = summarizeText(posting, { title: options.title, company: options.company, location: options.location });
  const match = scoreJob(jd, profile);
  const market = detectMarket(posting);
  const templates = selectTemplates(posting, profile, registry, { photoAvailable: options.photoAvailable ?? false });
  const projects = selectProjects(
    (profile.projects ?? []).filter((p) => p.disclosure !== "restricted" && p.disclosure !== "unreviewed"),
    posting,
  );

  const record = {
    job: {
      title: jd.title ?? null,
      company: jd.company ?? null,
      location: jd.location ?? null,
      remote: jd.remote,
      officeDaysPerWeek: jd.officeDaysPerWeek,
      yearsExperience: jd.yearsExperience,
    },
    fit: {
      score: match.score,
      breakdown: match.breakdown,
      matched: match.matched,
      gaps: match.gaps,
      neutral: match.neutral,
      eligibility: match.eligibility,
    },
    market: { code: market.code, name: market.name, language: preferredLanguage(market, posting), cvPages: market.pages },
    templates: {
      cv: templates.selected.cv,
      cover: templates.selected.cover,
      confidence: templates.confidence.level,
      warnings: templates.warnings,
    },
    projects: projects.selected.map((m) => m.project.slug),
    next: nextSteps(match.score, match.eligibility.status, jd.company, jd.title, options.jobPath),
  };
  if (!options.verbose) return record;
  return {
    ...record,
    detail: {
      skillEvidence: match.skillEvidence,
      cvRanking: templates.cv.map((t) => ({ name: t.name, score: t.score, available: t.available, factors: t.factors })),
      jobDomains: projects.jobDomains,
    },
  };
}

function nextSteps(score: number, eligibility: Eligibility, company?: string, title?: string, jobPath = "<posting>"): string[] {
  if (eligibility === "ineligible") return ["report the eligibility blocker to the user before any drafting"];
  if (score < 50) return ["present the fit assessment and gaps; ask the user whether to proceed"];
  const c = JSON.stringify(company ?? "<Company>");
  const r = JSON.stringify(title ?? "<Role>");
  const steps = eligibility === "review" ? ["confirm the eligibility constraints with the user"] : [];
  return [...steps, `jobsearch prepare --company ${c} --role ${r} --job ${JSON.stringify(jobPath)}`];
}
