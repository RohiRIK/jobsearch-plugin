#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { getTracker } from "../../src/tracker.js";
import { SeenJobsFile, generateApplicationId, ApplicationStatus } from "../../src/schemas.js";
import { Profile } from "../../src/profile-schemas.js";
import { buildDashboard } from "../dashboard.js";
import { pendingFollowups } from "../followup.js";
import { summarizeText } from "../jobs/summarize.js";
import { scoreJob } from "../match/score-job.js";
import { buildSourcePath } from "../../src/naming.js";
import { reevaluateDoc } from "../reevaluate.js";
import { loadRegistry, selectTemplates } from "../match/template-engine.js";
import { buildSnapshot } from "../jobs/market.js";
import { pendingAlerts } from "../jobs/alerts.js";
import { buildPrepSheet } from "../jobs/interview-prep.js";
import { draftParagraphs } from "../generate/cover-letter.js";
import {
  EvidenceItem,
  buildApplicationBrief,
  reviewApplicationDraft,
} from "../../src/application-draft.js";
import { CODE_ROOT, WORKSPACE as ROOT } from "../../src/paths.js";


function log(msg: string): void {
  process.stderr.write(`[job-search-mcp] ${msg}\n`);
}

function textResult(data: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], ...(isError ? { isError: true } : {}) };
}

function structuredResult<T extends object>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function readJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function readProfile(): Profile | null {
  const raw = readJson(join(ROOT, "data", "profile.json"));
  if (!raw) return null;
  const parsed = Profile.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const server = new McpServer({ name: "job-search-workspace", version: "1.0.0" });

server.registerTool(
  "get_profile",
  {
    title: "Get candidate profile",
    description:
      "Read the candidate profile (identity, skills, experience, education). Use before making any claim about the candidate — never invent skills or experience; empty sections mean the data genuinely is not there. No arguments.",
    inputSchema: {},
  },
  async () => {
    const raw = readJson(join(ROOT, "data", "profile.json"));
    if (!raw) return textResult({ error: "Profile not found. Run: bun run profile" }, true);
    const parsed = Profile.safeParse(raw);
    return parsed.success ? textResult(parsed.data) : textResult({ error: "Profile failed validation" }, true);
  },
);

server.registerTool(
  "list_jobs",
  {
    title: "List scraped jobs",
    description:
      "List deduplicated scraped job postings. Use for 'any new jobs?' and triage. Filters: status (new|skipped|evaluated|ranked|expired), market (il|dk|us|eu|remote). Prefer status=new for untriaged postings; mark them via list_alerts workflows after review.",
    inputSchema: {
      status: z.enum(["new", "skipped", "evaluated", "ranked", "expired"]).optional(),
      market: z.enum(["il", "dk", "us", "eu", "remote"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
  },
  async ({ status, market, limit }) => {
    const parsed = SeenJobsFile.safeParse(readJson(join(ROOT, "data", "seen-jobs.json")) ?? { seen: {} });
    if (!parsed.success) return textResult({ error: "seen-jobs.json failed validation" }, true);
    let jobs = Object.values(parsed.data.seen);
    if (status) jobs = jobs.filter((j) => j.status === status);
    if (market) jobs = jobs.filter((j) => j.market === market);
    return textResult({ total: jobs.length, jobs: jobs.slice(0, limit ?? 50) });
  },
);

server.registerTool(
  "list_applications",
  {
    title: "List tracked applications",
    description:
      "List tracked job applications. Use to find an application id before updating a status, or to review pipeline contents. Filters: status (planning|applied|interviewing|offer|rejected|no_answer), company (substring).",
    inputSchema: {
      status: ApplicationStatus.optional(),
      company: z.string().max(200).optional(),
    },
  },
  async ({ status, company }) => {
    const apps = getTracker().list({ status, company });
    return textResult({ total: apps.length, applications: apps });
  },
);

server.registerTool(
  "get_analytics",
  {
    title: "Get pipeline analytics",
    description:
      "Pipeline health dashboard: counts by status, response and interview rates, channel effectiveness ranking, top rejection reasons, pending follow-up count. Use for 'how is my job search going?'. No arguments.",
    inputSchema: {},
  },
  async () => textResult(buildDashboard()),
);

server.registerTool(
  "pending_followups",
  {
    title: "List pending follow-ups",
    description:
      "Applications due for a follow-up nudge (status applied, 7+ days old, no follow-up recorded). Use when planning the day; pair with the email CLI for drafts: bun run email --type followup --id <id>.",
    inputSchema: { days: z.number().int().min(0).max(365).optional() },
  },
  async ({ days }) => textResult({ pending: pendingFollowups(getTracker().list(), days ?? 7) }),
);

server.registerTool(
  "score_job",
  {
    title: "Score a job against the profile",
    description: "Parse a raw job description and score it 0-100 against the candidate profile (skills 40%, experience 25%, sector 15%, location 10%, language 10%). Returns breakdown, gaps, neutral factors, exact profile-skill evidence, and a separate eligibility status for explicit work-preference constraints; capability evidence remains visible even when a role is ineligible.",
    inputSchema: {
      text: z.string().min(10).max(50_000),
      title: z.string().max(200).optional(),
      company: z.string().max(200).optional(),
    },
  },
  async ({ text, title, company }) => {
    const rawProfile = readJson(join(ROOT, "data", "profile.json"));
    const profile = Profile.safeParse(rawProfile);
    if (!profile.success) return textResult({ error: "Profile not available. Run: bun run profile" }, true);
    const jd = summarizeText(text, { title, company });
    return textResult(scoreJob(jd, profile.data));
  },
);

server.registerTool(
  "add_application",
  {
    title: "Track a new application",
    description:
      "Insert a job application into the tracker. WRITE — requires confirm: true, and you must get an explicit human yes in-conversation first. Also gates any convention-named documents for this company/role and returns their reevaluation verdicts.",
    inputSchema: {
      company: z.string().min(1).max(200),
      role: z.string().min(1).max(200),
      status: ApplicationStatus.optional(),
      channel: z.string().max(100).optional(),
      notes: z.string().max(2000).optional(),
      fit_rating: z.number().int().min(0).max(100).optional(),
      confirm: z.literal(true),
    },
  },
  async ({ company, role, status, channel, notes, fit_rating, confirm }) => {
    if (confirm !== true) return textResult({ error: "Write requires confirm: true" }, true);
    const tracker = getTracker();
    const app = tracker.insert({
      id: generateApplicationId(company),
      date: new Date().toISOString().slice(0, 10),
      company,
      role,
      status: status ?? "planning",
      channel,
      notes,
      fit_rating,
    });

    // Gate any convention-named documents for this application and record the verdict.
    const documents: Array<{ file: string; verdict: string }> = [];
    for (const docType of ["cv", "cl"] as const) {
      const source = join(ROOT, buildSourcePath(docType, company, role));
      const pdf = source.replace(/\.(typ|tex)$/, ".pdf");
      if (!existsSync(source) && !existsSync(pdf)) continue;
      const report = await reevaluateDoc(source, docType);
      const verdict = report.pass
        ? "pass"
        : `fail:${report.gates.filter((g) => g.pass === false).map((g) => g.gate).join(",")}`;
      tracker.addDocumentVersion({ file_path: pdf, company, role, application_id: app.id, reevaluation: verdict });
      documents.push({ file: pdf.replace(ROOT + "/", ""), verdict });
    }

    return textResult({ created: app, documents: documents.length > 0 ? documents : "none found for this company/role" });
  },
);

server.registerTool(
  "update_application_status",
  {
    title: "Update application status",
    description:
      "Change the status (and optionally notes) of a tracked application — e.g. after a rejection email or interview invite. WRITE — requires confirm: true and an explicit human yes in-conversation first. Find the id via list_applications.",
    inputSchema: {
      id: z.string().regex(/^app_\d{8}_[a-z0-9-]+$/),
      status: ApplicationStatus,
      notes: z.string().max(2000).optional(),
      confirm: z.literal(true),
    },
  },
  async ({ id, status, notes, confirm }) => {
    if (confirm !== true) return textResult({ error: "Write requires confirm: true" }, true);
    const updated = getTracker().update(id, notes !== undefined ? { status, notes } : { status });
    return updated ? textResult({ updated }) : textResult({ error: `Not found: ${id}` }, true);
  },
);

server.registerTool(
  "select_template",
  {
    title: "Rank CV/cover templates for a posting",
    description:
      "Score every CV and cover-letter template against a job posting and the candidate profile (sector, formality, market/RTL, role fit, seniority, profile fit). Use when deciding which template to generate documents with. Returns ranked lists with per-factor rationale, a confidence level, and the selected (available, non-stub) templates. Args: posting_text = the raw job posting.",
    inputSchema: { posting_text: z.string().min(20).max(200_000) },
  },
  async ({ posting_text }) => {
    const registry = loadRegistry(join(CODE_ROOT, "templates"));
    const profile = readProfile();
    const result = selectTemplates(posting_text, profile, registry, {
      photoAvailable: existsSync(join(ROOT, "assets", "photos", "profile.jpg")),
    });
    return textResult(result);
  },
);

server.registerTool(
  "market_snapshot",
  {
    title: "Job market demand snapshot",
    description:
      "Aggregate all scraped jobs into a demand snapshot: totals, market/fit/status distribution, top skills in titles, top companies and locations. Use for 'what's in demand' and positioning questions. No arguments.",
    inputSchema: {},
  },
  async () => {
    const parsed = SeenJobsFile.safeParse(readJson(join(ROOT, "data", "seen-jobs.json")) ?? { seen: {} });
    if (!parsed.success) return textResult({ error: "seen-jobs.json invalid" }, true);
    return textResult(buildSnapshot(Object.values(parsed.data.seen), new Date().toISOString().slice(0, 10)));
  },
);

server.registerTool(
  "list_alerts",
  {
    title: "Unreviewed job alerts",
    description:
      "List scraped jobs still marked status=new (not yet triaged). Use when asked 'any new jobs?'. Optional filters: since (YYYY-MM-DD), fit (high|medium|low, comma-separated), market (il|dk|us|eu|remote, comma-separated).",
    inputSchema: {
      since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      fit: z.string().max(20).optional(),
      market: z.string().max(30).optional(),
    },
  },
  async ({ since, fit, market }) => {
    const parsed = SeenJobsFile.safeParse(readJson(join(ROOT, "data", "seen-jobs.json")) ?? { seen: {} });
    if (!parsed.success) return textResult({ error: "seen-jobs.json invalid" }, true);
    const alerts = pendingAlerts(parsed.data, {
      since,
      fit: fit?.split(","),
      market: market?.split(","),
    });
    return textResult({ pending: alerts.length, alerts });
  },
);

server.registerTool(
  "draft_cover_letter",
  {
    title: "Draft cover letter content",
    description:
      "Heuristic cover-letter draft (paragraphs, bullets, matched skills, honest gaps) from the profile and an optional posting. Read-only: returns the draft text and the convention-correct filename — it does NOT write files; generate the actual document with 'bun run cover-letter' or Claude Code's /apply (which also runs the reevaluation gate).",
    inputSchema: {
      company: z.string().min(1).max(200),
      role: z.string().min(1).max(200),
      posting_text: z.string().max(200_000).optional(),
    },
  },
  async ({ company, role, posting_text }) => {
    const profile = readProfile();
    if (!profile) return textResult({ error: "No profile. Run: bun run profile" }, true);
    const draft = draftParagraphs({ profile, company, role, posting: posting_text ?? null });
    return textResult({
      ...draft,
      suggested_file: buildSourcePath("cl", company, role),
      note: "heuristic draft — polish wording before sending; /apply enforces the full verification gate",
    });
  },
);

server.registerTool(
  "prepare_application",
  {
    title: "Prepare an evidence-grounded application brief",
    description:
      "Build a provider-neutral LLM prompt for a tailored CV and cover letter. Read-only: returns profile evidence IDs, honest gaps, missing facts, and a strict JSON response contract; it does not call an LLM or write files.",
    inputSchema: {
      company: z.string().min(1).max(200),
      role: z.string().min(1).max(200),
      posting_text: z.string().min(20).max(200_000),
      language: z.string().min(2).max(40).optional(),
      market: z.string().min(2).max(8).optional(),
    },
    outputSchema: {
      version: z.literal(1),
      company: z.string(),
      role: z.string(),
      language: z.string(),
      market: z.string(),
      marketName: z.string(),
      evidence: z.array(EvidenceItem),
      matched: z.array(z.string()),
      gaps: z.array(z.string()),
      missingFacts: z.array(z.string()),
      plan: z.record(z.string(), z.unknown()),
      layoutRecommendation: z.record(z.string(), z.unknown()),
      prompt: z.string(),
    },
  },
  async ({ company, role, posting_text, language, market }) => {
    const profile = readProfile();
    if (!profile) return textResult({ error: "No profile. Run: bun run profile" }, true);
    return structuredResult(buildApplicationBrief({ profile, posting: posting_text, company, role, language, market }));
  },
);

server.registerTool(
  "review_application_draft",
  {
    title: "Review an evidence-grounded application draft",
    description:
      "Validate a structured CV and cover-letter draft before rendering. Read-only: rejects unknown evidence IDs, unsupported numbers, genuine gaps presented as skills, schema errors, and context mismatches; returns deterministic style and length findings.",
    inputSchema: {
      company: z.string().min(1).max(200),
      role: z.string().min(1).max(200),
      posting_text: z.string().min(20).max(200_000),
      draft_json: z.string().min(2).max(200_000),
      language: z.string().min(2).max(40).optional(),
    },
    outputSchema: {
      pass: z.boolean(),
      findings: z.array(
        z.object({
          severity: z.enum(["error", "warning"]),
          code: z.string(),
          message: z.string(),
          path: z.string().optional(),
        }),
      ),
      metrics: z.object({
        coverLetterWords: z.number(),
        cvSummaryWords: z.number(),
        evidenceItemsUsed: z.number(),
        keywordCoverage: z.number(),
      }),
    },
  },
  async ({ company, role, posting_text, draft_json, language }) => {
    const profile = readProfile();
    if (!profile) return textResult({ error: "No profile. Run: bun run profile" }, true);
    let draft: unknown;
    try {
      draft = JSON.parse(draft_json);
    } catch {
      return structuredResult({
        pass: false,
        findings: [{ severity: "error" as const, code: "INVALID_JSON", message: "draft_json is not valid JSON" }],
        metrics: { coverLetterWords: 0, cvSummaryWords: 0, evidenceItemsUsed: 0, keywordCoverage: 0 },
      });
    }
    const brief = buildApplicationBrief({ profile, posting: posting_text, company, role, language });
    return structuredResult(reviewApplicationDraft(draft, brief));
  },
);

server.registerPrompt(
  "tailor_application",
  {
    title: "Tailor a CV and cover letter",
    description:
      "Draft a factual CV and cover letter from profile evidence and a job posting, returning the ApplicationDraft JSON contract for review and rendering.",
    argsSchema: {
      company: z.string().min(1).max(200),
      role: z.string().min(1).max(200),
      posting_text: z.string().min(20).max(200_000),
      language: z.string().min(2).max(40).optional(),
    },
  },
  ({ company, role, posting_text, language }) => {
    const profile = readProfile();
    const text = profile
      ? buildApplicationBrief({ profile, posting: posting_text, company, role, language }).prompt
      : "Candidate profile is unavailable. Stop and ask the user to run `bun run profile`; do not draft from assumptions.";
    return { messages: [{ role: "user", content: { type: "text", text } }] };
  },
);

server.registerTool(
  "interview_prep",
  {
    title: "Interview prep sheet",
    description:
      "Build an interview preparation sheet from a job posting and the profile: likely technical and behavioral questions, talking points, honest gap strategies, and questions to ask the interviewer. Args: posting_text (required), company/role overrides (optional).",
    inputSchema: {
      posting_text: z.string().min(20).max(200_000),
      company: z.string().max(200).optional(),
      role: z.string().max(200).optional(),
    },
  },
  async ({ posting_text, company, role }) => {
    return textResult(buildPrepSheet(posting_text, readProfile(), { company, role }));
  },
);

server.registerResource(
  "weekly-report",
  "jobsearch://reports/latest",
  {
    title: "Latest weekly report",
    description: "Most recent weekly review report (markdown)",
    mimeType: "text/markdown",
  },
  async (uri) => {
    const dir = join(ROOT, "data", "reports");
    if (!existsSync(dir)) {
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: "_No reports yet. Run: bun run pipeline:weekly_" }] };
    }
    const { readdirSync } = await import("node:fs");
    const latest = readdirSync(dir).filter((f) => f.startsWith("weekly-")).sort().pop();
    const text = latest ? readFileSync(join(dir, latest), "utf-8") : "_No reports yet._";
    return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
  },
);

if (import.meta.main) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("listening on stdio");
}

export { server };
