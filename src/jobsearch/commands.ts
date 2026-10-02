/**
 * The command table: the single source of truth for `jobsearch` CLI parsing,
 * `--help-json`, the generated MCP tools, and the plugin test that checks every
 * command a skill names exists.
 *
 * Adding a command = one entry here + its contract tests in
 * tests/jobsearch-cli.test.ts. Mutations set `mutation: true` and call
 * `confirmWrite` before writing.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { ApplicationStatus, JobApplicationCreate, generateApplicationId } from "../schemas.js";
import { buildSourcePath, loadConfig, profileDocumentName } from "../naming.js";
import { resolveBin } from "../resolve-bin.js";
import { pendingFollowups } from "../../scripts/followup.js";
import { selectTemplates } from "../../scripts/match/template-engine.js";
import { CODE_ROOT, WORKSPACE } from "../paths.js";
import {
  AgentError,
  EXIT,
  confirmWrite,
  intFlag,
  str,
  type CommandResult,
  type CommandSpec,
  type FlagSpec,
  type Values,
} from "./contract.js";
import { DEFAULT_PROFILE, PHOTO_PATH, loadProfile, loadTemplates, profilePath, readPosting, triagePosting } from "./triage.js";
import { runTool, toolFailure } from "./tools.js";
import { dataBackup, dataMigrate, dataWhere, savedPostings, workspaceSource } from "./data.js";

const PROFILE_FLAG: FlagSpec = { type: "string", description: "Profile JSON path (default: <workspace>/data/profile.json)" };
const STATUSES = ApplicationStatus.options;
const MUTATION_FLAGS: Record<string, FlagSpec> = {
  yes: { type: "boolean", description: "Confirm the write — only after a human yes in-conversation" },
  "dry-run": { type: "boolean", description: "Preview; write nothing; exit 10" },
};

async function withTracker<T>(fn: (tracker: import("../tracker.js").Tracker) => T): Promise<T> {
  const { getTracker, closeTracker } = await import("../tracker.js");
  try {
    return fn(getTracker());
  } finally {
    closeTracker();
  }
}

async function canvasAvailable(): Promise<boolean> {
  try {
    await import("@napi-rs/canvas");
    return true;
  } catch {
    return false;
  }
}

// ─── status ─────────────────────────────────────────────────────────────────

async function runStatus(values: Values): Promise<CommandResult> {
  const pPath = profilePath(str(values, "profile"));
  let profile: { path: string; exists: boolean; valid: boolean; issue?: string } = { path: pPath, exists: existsSync(pPath), valid: false };
  if (profile.exists) {
    try {
      loadProfile(str(values, "profile"));
      profile.valid = true;
    } catch (err) {
      profile.issue = err instanceof Error ? err.message : String(err);
    }
  }
  const days = intFlag(str(values, "days"), "days", 7, 0);
  const tracker = await withTracker((t) => {
    const apps = t.list();
    const byStatus: Record<string, number> = {};
    for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    const due = pendingFollowups(apps, days);
    return { total: apps.length, byStatus, followupsDue: due.length, followups: due.slice(0, 5).map((d) => ({ id: d.id, company: d.company, days: d.daysSinceApplied })) };
  });
  const tools = {
    typst: Boolean(resolveBin("typst")),
    pdftotext: Boolean(resolveBin("pdftotext")),
    pdfinfo: Boolean(resolveBin("pdfinfo")),
    canvas: await canvasAvailable(),
  };
  const postings = savedPostings();
  const next: string[] = [];
  if (!profile.exists) next.push("onboard: create the profile (init skill)");
  else if (!profile.valid) next.push("fix the profile validation issue before scoring anything");
  if (tracker.followupsDue > 0) next.push(`${tracker.followupsDue} follow-up(s) due: jobsearch followups`);
  if (postings.length > 0) next.push(`rank saved postings: jobsearch rank --dir ${JSON.stringify(join(WORKSPACE, "data", "jd"))}`);
  if (!tools.typst) next.push("jobsearch tools-install --tool typst --dry-run (installs a pinned Typst into the workspace, no global install)");
  if (!tools.typst || !tools.pdftotext || !tools.canvas) next.push("documents cannot pass the shipping gate until typst, pdftotext and canvas are all available");
  return {
    data: {
      workspace: { path: WORKSPACE, resolvedFrom: workspaceSource(), codeRoot: CODE_ROOT },
      profile,
      tracker,
      postings: { saved: postings.length },
      tools,
      next,
    },
  };
}

// ─── triage / rank ──────────────────────────────────────────────────────────

async function runTriage(values: Values): Promise<CommandResult> {
  const jobPath = str(values, "job")!;
  const posting = readPosting(jobPath);
  const profile = loadProfile(str(values, "profile"));
  const data = triagePosting(posting, profile, loadTemplates(), {
    title: str(values, "title"),
    company: str(values, "company"),
    location: str(values, "location"),
    verbose: values.verbose === true,
    photoAvailable: existsSync(PHOTO_PATH),
    jobPath,
  });
  return { data };
}

async function runRank(values: Values): Promise<CommandResult> {
  const dirArg = str(values, "dir") ?? join(WORKSPACE, "data", "jd");
  const dir = resolve(process.cwd(), dirArg);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new AgentError("not_found", `directory not found: ${dirArg}`, ["save postings under <workspace>/data/jd/ or pass --dir"]);
  }
  const limit = intFlag(str(values, "limit"), "limit", 25, 1);
  const minScore = intFlag(str(values, "min-score"), "min-score", 0);
  const profile = loadProfile(str(values, "profile"));
  const registry = loadTemplates();
  const photoAvailable = existsSync(PHOTO_PATH);
  const files = readdirSync(dir).filter((f) => /\.(txt|md)$/i.test(f)).sort();
  if (files.length === 0) throw new AgentError("not_found", `no .txt/.md postings in ${dirArg}`);

  const rows: Array<Record<string, unknown> & { score: number }> = [];
  for (const file of files) {
    try {
      const t = triagePosting(readPosting(join(dir, file)), profile, registry, { photoAvailable });
      rows.push({
        file,
        score: t.fit.score,
        eligibility: t.fit.eligibility.status,
        title: t.job.title,
        company: t.job.company,
        market: t.market.code,
        gaps: t.fit.gaps.slice(0, 5),
        template: t.templates.cv,
      });
    } catch (err) {
      // One bad posting must not hide the rest of the batch; report it inline.
      rows.push({ file, score: -1, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const out = rows
    .filter((r) => r.score === -1 || r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { data: { dir, total: files.length, returned: out.length, rows: out }, rows: out };
}

// ─── application pipeline (delegated) ───────────────────────────────────────

function passThrough(values: Values, names: string[]): string[] {
  const args: string[] = [];
  for (const name of names) {
    const v = values[name];
    if (typeof v === "string") args.push(`--${name}`, v);
    else if (v === true) args.push(`--${name}`);
  }
  return args;
}

async function runPrepare(values: Values): Promise<CommandResult> {
  const company = str(values, "company")!;
  const role = str(values, "role")!;
  const jobPath = str(values, "job")!;
  const posting = readPosting(jobPath);
  const run = await runTool("application", ["prepare", ...passThrough(values, ["company", "role", "job", "profile", "market", "language"])]);
  if (run.code !== 0 || run.json === undefined) throw toolFailure("application", run);
  const profile = loadProfile(str(values, "profile"));
  const templates = selectTemplates(posting, profile, loadTemplates(), { photoAvailable: existsSync(PHOTO_PATH) });
  const naming = { ...loadConfig(), name: profileDocumentName(profile.identity) };
  return {
    data: {
      brief: run.json,
      templates: { cv: templates.selected.cv, cover: templates.selected.cover },
      paths: { cv: buildSourcePath("cv", company, role, naming), coverLetter: buildSourcePath("cl", company, role, naming), workspace: WORKSPACE },
      next: [
        "draft ApplicationDraft JSON against brief.prompt with the host model",
        `jobsearch review --draft <draft.json> --job ${JSON.stringify(jobPath)}`,
      ],
    },
  };
}

async function runReview(values: Values): Promise<CommandResult> {
  const run = await runTool("application", ["review", ...passThrough(values, ["draft", "job", "profile", "company", "role", "market", "language"])]);
  if (run.json === undefined) throw toolFailure("application", run);
  const review = run.json as { pass?: boolean };
  return { data: review, exit: review.pass ? EXIT.ok : EXIT.verdictFailed };
}

async function runRender(values: Values): Promise<CommandResult> {
  const reviewArgs = passThrough(values, ["draft", "job", "profile", "company", "role", "market", "language"]);
  const preview = confirmWrite(values, "render", `jobsearch render --draft ${JSON.stringify(str(values, "draft"))} --job ${JSON.stringify(str(values, "job"))}`);
  if (preview) {
    const run = await runTool("application", ["review", ...reviewArgs]);
    if (run.json === undefined) throw toolFailure("application", run);
    return { data: { dryRun: true, review: run.json, wouldWrite: "convention-named Typst CV + cover letter under <workspace>/assets/applications/" }, exit: EXIT.dryRun };
  }
  const run = await runTool("application", ["render", ...passThrough(values, ["draft", "job", "profile", "company", "role", "market", "language", "layout", "cv-template", "cl-template", "date", "links", "compile", "force"])]);
  if (run.json !== undefined) {
    const out = run.json as { written?: boolean };
    return { data: out, exit: run.code === 0 ? EXIT.ok : EXIT.verdictFailed };
  }
  throw toolFailure("application", run);
}

interface GateDoc {
  file: string;
  docType: string;
  pass: boolean;
  gates: Array<{ gate: string; pass: boolean | null; detail: string; hint?: string }>;
}

async function runGate(values: Values): Promise<CommandResult> {
  if (!str(values, "file") && !(str(values, "company") && str(values, "role"))) {
    throw new AgentError("usage", "gate needs --file, or both --company and --role", ['jobsearch gate --company "<Company>" --role "<Role>"']);
  }
  const run = await runTool("reevaluate", passThrough(values, ["company", "role", "type", "file", "market", "profile", "allow-missing-ats"]), { timeoutMs: 300_000 });
  if (run.json === undefined) throw toolFailure("reevaluate", run);
  const report = run.json as { documents: GateDoc[]; pass: boolean };
  const documents = values.verbose === true
    ? report.documents
    : report.documents.map((d) => ({
        file: d.file,
        docType: d.docType,
        pass: d.pass,
        failing: d.gates.filter((g) => g.pass !== true).map((g) => ({ gate: g.gate, pass: g.pass, detail: g.detail, ...(g.hint ? { hint: g.hint } : {}) })),
      }));
  return { data: { pass: report.pass, documents, submissionReady: report.pass && values["allow-missing-ats"] !== true }, exit: report.pass ? EXIT.ok : EXIT.verdictFailed };
}

// ─── scrape ─────────────────────────────────────────────────────────────────

async function runScrape(values: Values): Promise<CommandResult> {
  const limit = intFlag(str(values, "limit"), "limit", 25, 1);
  const run = await runTool("pipeline", ["scrape", ...passThrough(values, ["query", "portals"])], { timeoutMs: 180_000 });
  if (run.json === undefined) throw toolFailure("pipeline", run);
  const out = run.json as { portals: Record<string, { added: number; error?: string }>; errored: string[]; newJobs: Array<Record<string, unknown>>; totalSeen: number };
  const newJobs = out.newJobs.slice(0, limit).map((j) => ({ title: j.title, company: j.company, location: j.location, url: j.url, portal: j.portal, market: j.market }));
  return {
    data: { portals: out.portals, errored: out.errored, newJobs: out.newJobs.length, jobs: newJobs, totalSeen: out.totalSeen },
    exit: Object.values(out.portals).some((p) => !p.error) ? EXIT.ok : EXIT.external,
  };
}

// ─── tracker ────────────────────────────────────────────────────────────────

function validStatus(status: string | undefined): void {
  if (status && !ApplicationStatus.safeParse(status).success) {
    throw new AgentError("validation", `unknown --status ${JSON.stringify(status)}`, [`use one of: ${STATUSES.join(", ")}`]);
  }
}

async function runTrackerList(values: Values): Promise<CommandResult> {
  const status = str(values, "status");
  validStatus(status);
  const limit = intFlag(str(values, "limit"), "limit", 25, 1);
  return withTracker((tracker) => {
    const all = tracker.list({ status, company: str(values, "company") });
    const rows = all.slice(0, limit).map((a) => ({ id: a.id, date: a.date, company: a.company, role: a.role, status: a.status, fit: a.fit_rating ?? null }));
    return { data: { total: all.length, returned: rows.length, applications: rows } };
  });
}

async function runTrackerAdd(values: Values): Promise<CommandResult> {
  const company = str(values, "company")!;
  const role = str(values, "role")!;
  const status = str(values, "status") ?? "planning";
  validStatus(status);
  const fitRaw = str(values, "fit");
  const candidate = {
    id: generateApplicationId(company),
    date: str(values, "date") ?? new Date().toISOString().slice(0, 10),
    company,
    role,
    status,
    channel: str(values, "channel"),
    notes: str(values, "notes"),
    source: str(values, "source"),
    fit_rating: fitRaw === undefined ? undefined : intFlag(fitRaw, "fit", 0, 0),
  };
  const parsed = JobApplicationCreate.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AgentError("validation", `invalid application: ${issue?.path.join(".")}: ${issue?.message}`);
  }
  const preview = confirmWrite(values, "tracker-add", `jobsearch tracker-add --company ${JSON.stringify(company)} --role ${JSON.stringify(role)}`);
  return withTracker((tracker) => {
    const existing = tracker.get(parsed.data.id);
    if (existing) {
      throw new AgentError("conflict", `application ${existing.id} already exists (${existing.company} — ${existing.role})`, [`jobsearch tracker-status --id ${existing.id} --status <status>`], true, { existing: { id: existing.id, status: existing.status } });
    }
    if (preview) return { data: { dryRun: true, wouldCreate: parsed.data }, exit: EXIT.dryRun };
    const created = tracker.insert(parsed.data);
    return { data: { created: { id: created.id, date: created.date, company: created.company, role: created.role, status: created.status } } };
  });
}

async function runTrackerStatus(values: Values): Promise<CommandResult> {
  const id = str(values, "id")!;
  const status = str(values, "status")!;
  if (!/^app_\d{8}_[a-z0-9-]+$/.test(id)) throw new AgentError("validation", `malformed --id ${JSON.stringify(id)}`, ["jobsearch tracker-list"]);
  if (!ApplicationStatus.safeParse(status).success) {
    throw new AgentError("validation", `unknown --status ${JSON.stringify(status)}`, [`use one of: ${STATUSES.join(", ")}`]);
  }
  const preview = confirmWrite(values, "tracker-status", `jobsearch tracker-status --id ${id} --status ${status}`);
  return withTracker((tracker) => {
    const existing = tracker.get(id);
    if (!existing) throw new AgentError("not_found", `no application ${id}`, ["jobsearch tracker-list"]);
    const change = { id, from: existing.status, to: status };
    if (existing.status === status) return { data: { ...change, changed: false } };
    if (preview) return { data: { ...change, changed: false, dryRun: true }, exit: EXIT.dryRun };
    tracker.update(id, { status: status as ApplicationStatus });
    return { data: { ...change, changed: true } };
  });
}

async function runFollowups(values: Values): Promise<CommandResult> {
  const days = intFlag(str(values, "days"), "days", 7, 0);
  return withTracker((tracker) => {
    const due = pendingFollowups(tracker.list(), days);
    return { data: { minDays: days, due: due.length, followups: due } };
  });
}

async function runInterviewPrep(values: Values): Promise<CommandResult> {
  readPosting(str(values, "job")!);
  const run = await runTool("interview-prep", passThrough(values, ["job", "profile"]));
  if (run.code !== 0 || run.json === undefined) throw toolFailure("interview-prep", run);
  return { data: run.json };
}

// ─── the table ──────────────────────────────────────────────────────────────

export const CORE_COMMANDS: Record<string, CommandSpec> = {
  status: {
    summary: "Health and next steps: workspace, profile, tracker, follow-ups due, document tools",
    mutation: false,
    output: "json",
    mcpTool: "jobsearch_status",
    flags: { profile: PROFILE_FLAG, days: { type: "string", description: "Follow-up threshold in days", default: "7" } },
    run: runStatus,
  },
  triage: {
    summary: "Fit score, gaps, eligibility, market, template and projects for one posting",
    mutation: false,
    output: "json",
    mcpTool: "jobsearch_triage",
    flags: {
      job: { type: "string", required: true, description: "Posting text/markdown file" },
      title: { type: "string", description: "Override detected job title" },
      company: { type: "string", description: "Override detected company" },
      location: { type: "string", description: "Override detected location" },
      profile: PROFILE_FLAG,
      verbose: { type: "boolean", description: "Add template rationale and skill evidence" },
    },
    run: runTriage,
  },
  rank: {
    summary: "Triage every saved posting, best fit first",
    mutation: false,
    output: "ndjson",
    mcpTool: "jobsearch_rank",
    flags: {
      dir: { type: "string", description: "Directory of .txt/.md postings", default: "<workspace>/data/jd" },
      profile: PROFILE_FLAG,
      limit: { type: "string", description: "Max rows", default: "25" },
      "min-score": { type: "string", description: "Drop postings scoring below this", default: "0" },
    },
    run: runRank,
  },
  prepare: {
    summary: "Drafting brief, templates and output paths for one application (writes nothing)",
    mutation: false,
    output: "json",
    mcpTool: "jobsearch_prepare",
    flags: {
      company: { type: "string", required: true, description: "Employer name" },
      role: { type: "string", required: true, description: "Role title" },
      job: { type: "string", required: true, description: "Posting file" },
      profile: PROFILE_FLAG,
      market: { type: "string", description: "Force a market code (de, dk, il…)" },
      language: { type: "string", description: "Cover-letter language" },
    },
    run: runPrepare,
  },
  review: {
    summary: "Validate an ApplicationDraft: schema, evidence references, unsupported numbers, style. Exit 1 when it does not pass",
    mutation: false,
    output: "json",
    flags: {
      draft: { type: "string", required: true, description: "ApplicationDraft JSON file" },
      job: { type: "string", required: true, description: "Posting file" },
      profile: PROFILE_FLAG,
      company: { type: "string", description: "Override draft company" },
      role: { type: "string", description: "Override draft role" },
      market: { type: "string", description: "Force a market code" },
      language: { type: "string", description: "Cover-letter language" },
    },
    run: runReview,
  },
  render: {
    summary: "Review, then write the convention-named Typst CV + cover letter",
    mutation: true,
    output: "json",
    flags: {
      draft: { type: "string", required: true, description: "ApplicationDraft JSON file" },
      job: { type: "string", required: true, description: "Posting file" },
      layout: { type: "string", description: "CV layout chosen from prepare's shortlist (required to write)" },
      "cv-template": { type: "string", description: "Typst CV template", default: "modern" },
      "cl-template": { type: "string", description: "Typst cover template", default: "modern" },
      date: { type: "string", description: "Output date YYYY-MM-DD (default today)" },
      links: { type: "string", description: "Profile links on the CV, comma-separated: linkedin,github,blog (default: all the profile has)" },
      compile: { type: "boolean", description: "Compile both sources after writing" },
      force: { type: "boolean", description: "Overwrite existing convention-named sources" },
      profile: PROFILE_FLAG,
      company: { type: "string", description: "Override draft company" },
      role: { type: "string", description: "Override draft role" },
      market: { type: "string", description: "Force a market code" },
      language: { type: "string", description: "Document language; required to confirm one that differs from the posting's" },
      ...MUTATION_FLAGS,
    },
    run: runRender,
  },
  gate: {
    summary: "Shipping gate (compile, pages, layout, ATS, naming): failing gates + fix hints; exit 1 until it passes",
    mutation: false,
    output: "json",
    mcpTool: "jobsearch_gate",
    flags: {
      company: { type: "string", description: "Employer (with --role)" },
      role: { type: "string", description: "Role title (with --company)" },
      file: { type: "string", description: "Gate one document instead" },
      type: { type: "string", description: "cv, cl or both", enum: ["cv", "cl", "both"] },
      market: { type: "string", description: "Market code for the page budget" },
      profile: PROFILE_FLAG,
      "allow-missing-ats": { type: "boolean", description: "Local pilot only; never submission-ready" },
      verbose: { type: "boolean", description: "Include passing gates too" },
    },
    run: runGate,
  },
  scrape: {
    summary: "Search the job portals concurrently, dedupe against seen jobs and the tracker (updates the seen-jobs record)",
    mutation: false,
    output: "json",
    flags: {
      query: { type: "string", required: true, description: "Search text" },
      portals: { type: "string", description: "Comma-separated portal names (default: all)" },
      limit: { type: "string", description: "Max new jobs listed", default: "25" },
    },
    run: runScrape,
  },
  followups: {
    summary: "Applications due a follow-up",
    mutation: false,
    output: "json",
    flags: { days: { type: "string", description: "Minimum days since applying", default: "7" } },
    run: runFollowups,
  },
  "interview-prep": {
    summary: "Likely questions, talking points and gap prep for one posting",
    mutation: false,
    output: "json",
    flags: { job: { type: "string", required: true, description: "Posting file" }, profile: PROFILE_FLAG },
    run: runInterviewPrep,
  },
  "tracker-list": {
    summary: "List tracked applications (compact rows)",
    mutation: false,
    output: "json",
    flags: {
      status: { type: "string", description: `Filter: ${STATUSES.join("|")}`, enum: STATUSES },
      company: { type: "string", description: "Substring filter on company" },
      limit: { type: "string", description: "Max rows", default: "25" },
    },
    run: runTrackerList,
  },
  "tracker-add": {
    summary: "Track a new application",
    mutation: true,
    output: "json",
    flags: {
      company: { type: "string", required: true, description: "Employer" },
      role: { type: "string", required: true, description: "Role title" },
      status: { type: "string", description: STATUSES.join("|"), default: "planning", enum: STATUSES },
      date: { type: "string", description: "YYYY-MM-DD (default today)" },
      channel: { type: "string", description: "How you applied" },
      source: { type: "string", description: "Posting URL" },
      fit: { type: "string", description: "Fit score 0-100" },
      notes: { type: "string", description: "Free-text notes" },
      ...MUTATION_FLAGS,
    },
    run: runTrackerAdd,
  },
  "tracker-status": {
    summary: "Change an application's status",
    mutation: true,
    output: "json",
    flags: {
      id: { type: "string", required: true, description: "Application id (app_YYYYMMDD_slug)" },
      status: { type: "string", required: true, description: STATUSES.join("|"), enum: STATUSES },
      ...MUTATION_FLAGS,
    },
    run: runTrackerStatus,
  },
  "data-where": {
    summary: "Where personal data lives and how that was resolved",
    mutation: false,
    output: "json",
    flags: {},
    run: dataWhere,
  },
  "data-backup": {
    summary: "Archive the workspace's personal data to a timestamped tar.gz",
    mutation: true,
    output: "json",
    flags: { out: { type: "string", description: "Directory for the archive (default <workspace>/backups)" }, ...MUTATION_FLAGS },
    run: dataBackup,
  },
  "data-migrate": {
    summary: "Copy personal data from another workspace (e.g. an old checkout) into this one; never deletes or overwrites",
    mutation: true,
    output: "json",
    flags: {
      from: { type: "string", required: true, description: "Source workspace (a checkout root or JOB_SEARCH_HOME)" },
      to: { type: "string", description: "Target workspace (default: the current one)" },
      ...MUTATION_FLAGS,
    },
    run: dataMigrate,
  },
};

export { DEFAULT_PROFILE };
