#!/usr/bin/env bun
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { SeenJobsFile, SeenJobEntry, generateApplicationId } from "../../src/schemas.js";
import { getTracker, closeTracker } from "../../src/tracker.js";
import { main as buildProfileMain } from "../profile/build-profile.js";
import { main as reasonMain } from "../profile/reason.js";
import { main as feedbackMain } from "../profile/feedback.js";
import { summarizeText } from "../jobs/summarize.js";
import { scoreJob } from "../match/score-job.js";
import { loadRegistry, selectTemplates } from "../match/template-engine.js";
import { Profile } from "../../src/profile-schemas.js";
import { compile } from "../build/cli.js";
import { buildDashboard } from "../dashboard.js";
import { loadConfig, walkDocuments } from "../../src/naming.js";
import { reevaluateDoc } from "../reevaluate.js";
import { buildSnapshot } from "../jobs/market.js";
import { pendingAlerts } from "../jobs/alerts.js";
import { ingestPortalCard } from "../../src/job-ingestion.js";
import { CODE_ROOT, WORKSPACE as ROOT } from "../../src/paths.js";

const STATE_PATH = join(ROOT, "data", "pipeline-state.json");
const SEEN_JOBS_PATH = join(ROOT, "data", "seen-jobs.json");
const REPORTS_DIR = join(ROOT, "data", "reports");
const PROFILE_PATH = join(ROOT, "data", "profile.json");

export const PORTALS: Record<string, { path: string; market: SeenJobEntry["market"] }> = {
  alljobs: { path: ".agents/skills/alljobs-search/cli/src/cli.ts", market: "il" },
  drushim: { path: ".agents/skills/drushim-search/cli/src/cli.ts", market: "il" },
  jobmaster: { path: ".agents/skills/jobmaster-search/cli/src/cli.ts", market: "il" },
  jobindex: { path: ".agents/skills/jobindex-search/cli/src/cli.ts", market: "dk" },
  jobbank: { path: ".agents/skills/jobbank-search/cli/src/cli.ts", market: "dk" },
  remoteok: { path: ".agents/skills/remoteok-search/cli/src/cli.ts", market: "remote" },
  remotive: { path: ".agents/skills/remotive-search/cli/src/cli.ts", market: "remote" },
  arbeitnow: { path: ".agents/skills/arbeitnow-search/cli/src/cli.ts", market: "eu" },
  wwr: { path: ".agents/skills/wwr-search/cli/src/cli.ts", market: "remote" },
};

/** A bundled plugin ships portals as dist/portals/<name>.js; a checkout runs them from source. */
export function portalEntry(portal: string): string {
  const bundled = join(CODE_ROOT, "dist", "portals", `${portal}.js`);
  return existsSync(bundled) ? bundled : join(CODE_ROOT, PORTALS[portal].path);
}

interface StepRecord {
  name: string;
  status: "ok" | "error" | "skip";
  at: string;
  detail?: string;
}

interface PipelineState {
  command: string;
  startedAt: string;
  finishedAt?: string;
  steps: StepRecord[];
}

function loadState(): PipelineState | null {
  if (!existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as PipelineState;
  } catch {
    return null;
  }
}

function saveState(state: PipelineState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

function emitStep(step: StepRecord): void {
  process.stdout.write(JSON.stringify({ step: step.name, status: step.status, detail: step.detail }) + "\n");
}

async function runStep(
  state: PipelineState,
  name: string,
  resume: boolean,
  fn: () => Promise<string | void> | string | void,
): Promise<boolean> {
  if (resume && state.steps.some((s) => s.name === name && s.status === "ok")) {
    emitStep({ name, status: "skip", at: new Date().toISOString(), detail: "already completed (resume)" });
    return true;
  }
  try {
    const detail = await fn();
    const record: StepRecord = { name, status: "ok", at: new Date().toISOString(), detail: typeof detail === "string" ? detail : undefined };
    state.steps = [...state.steps.filter((s) => s.name !== name), record];
    saveState(state);
    emitStep(record);
    return true;
  } catch (err) {
    const record: StepRecord = {
      name,
      status: "error",
      at: new Date().toISOString(),
      detail: err instanceof Error ? err.message : String(err),
    };
    state.steps = [...state.steps.filter((s) => s.name !== name), record];
    saveState(state);
    emitStep(record);
    return false;
  }
}

async function callMain(fn: (() => number | Promise<number>), args: string[]): Promise<void> {
  const saved = process.argv;
  process.argv = [saved[0], saved[1], ...args];
  try {
    const code = await fn();
    if (code !== 0) throw new Error(`step exited with code ${code}`);
  } finally {
    process.argv = saved;
  }
}

function newState(command: string, resume: boolean): PipelineState {
  const prior = loadState();
  if (resume && prior && prior.command === command && !prior.finishedAt) return prior;
  return { command, startedAt: new Date().toISOString(), steps: [] };
}

function loadProfile(): Profile | null {
  try {
    const parsed = Profile.safeParse(JSON.parse(readFileSync(PROFILE_PATH, "utf-8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function loadSeenJobs(): SeenJobsFile {
  if (!existsSync(SEEN_JOBS_PATH)) return { seen: {} };
  try {
    const parsed = SeenJobsFile.safeParse(JSON.parse(readFileSync(SEEN_JOBS_PATH, "utf-8")));
    return parsed.success ? parsed.data : { seen: {} };
  } catch {
    return { seen: {} };
  }
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function cmdProfile(flags: Flags, state: PipelineState): Promise<number> {
  const args = ["--skip-blog"];
  if (flags["skip-github"]) args.push("--skip-github");
  const ok = await runStep(state, "profile", flags.resume ?? false, () => callMain(buildProfileMain, args));
  return ok ? 0 : 1;
}

async function cmdScrape(flags: Flags, state: PipelineState): Promise<number> {
  const query = flags.query;
  if (!query) {
    process.stderr.write(JSON.stringify({ error: "pipeline scrape requires --query <text>", code: "NO_QUERY" }) + "\n");
    return 1;
  }
  const requested = flags.portals ? flags.portals.split(",").map((p) => p.trim()) : Object.keys(PORTALS);
  const unknown = requested.filter((p) => !PORTALS[p]);
  if (unknown.length > 0) {
    process.stderr.write(JSON.stringify({ error: `Unknown portals: ${unknown.join(", ")}. Available: ${Object.keys(PORTALS).join(", ")}`, code: "BAD_PORTAL" }) + "\n");
    return 1;
  }

  const seenFile = loadSeenJobs();
  const today = new Date().toISOString().slice(0, 10);
  const newJobs: Array<SeenJobEntry & { portal: string }> = [];
  let anyOk = false;

  // Fetch phase runs all portals concurrently (network-bound); state writes and
  // dedup stay sequential below so pipeline-state and seen-jobs never race.
  const fetches = new Map<string, Promise<{ raw?: string; error?: string }>>();
  for (const portal of requested) {
    const cliPath = portalEntry(portal);
    if (!existsSync(cliPath)) {
      fetches.set(portal, Promise.resolve({ error: `portal '${portal}' is not available in this install (checkout-only: ${PORTALS[portal].path})` }));
      continue;
    }
    fetches.set(
      portal,
      (async () => {
        const proc = Bun.spawn([process.execPath, cliPath, "search", "-q", query, "--format", "json"], {
          cwd: CODE_ROOT,
          stdout: "pipe",
          stderr: "pipe",
          timeout: 60_000,
        });
        const [raw, err] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]);
        const exitCode = await proc.exited;
        if (exitCode !== 0) return { error: err.trim().split("\n").pop() ?? `exit ${exitCode}` };
        return { raw: raw.trim() };
      })().catch((e) => ({ error: String(e) }))
    );
  }

  const perPortal: Record<string, { added: number; error?: string }> = {};
  for (const portal of requested) {
    const { market } = PORTALS[portal];
    const fetched = await fetches.get(portal)!;
    let added = 0;
    const ok = await runStep(state, `scrape:${portal}`, flags.resume ?? false, () => {
      if (fetched.error !== undefined || fetched.raw === undefined) {
        throw new Error(fetched.error ?? "no output");
      }
      const parsed = JSON.parse(fetched.raw) as Record<string, unknown> | Array<Record<string, unknown>>;
      const cards = Array.isArray(parsed)
        ? parsed
        : ((parsed.results ?? parsed.jobs ?? parsed.cards ?? []) as Array<Record<string, unknown>>);
      for (const card of cards) {
        const ingested = ingestPortalCard(card, { portal, market, observedAt: today, seen: seenFile.seen });
        if (!ingested) continue;
        const key = ingested.existingUrl ?? ingested.entry.url;
        seenFile.seen = { ...seenFile.seen, [key]: ingested.entry };
        if (ingested.duplicate) continue;
        newJobs.push({ ...ingested.entry, portal });
        added++;
      }
      return `${added} new jobs`;
    });
    perPortal[portal] = ok ? { added } : { added: 0, error: fetched.error ?? "failed" };
    if (ok) anyOk = true;
  }

  const errored = Object.entries(perPortal).filter(([, v]) => v.error).map(([p]) => p);
  writeFileSync(SEEN_JOBS_PATH, JSON.stringify(seenFile, null, 2) + "\n");
  process.stdout.write(
    JSON.stringify(
      {
        query,
        portals: perPortal,
        errored,
        newJobs,
        totalSeen: Object.keys(seenFile.seen).length,
        seenFile: "data/seen-jobs.json",
      },
      null,
      2,
    ) + "\n",
  );
  return anyOk ? 0 : 1;
}

async function cmdReason(flags: Flags, state: PipelineState): Promise<number> {
  const resume = flags.resume ?? false;
  const analyzed = await runStep(state, "reason:analyze", resume, () => callMain(reasonMain, ["analyze"]));
  if (!analyzed) return 1;

  // Suggestions are a review queue, not an implicit profile migration. Profile
  // mutation remains behind the explicit `feedback suggest --apply` command,
  // where the user can inspect the exact proposed changes first.
  await runStep(state, "reason:feedback", resume, () => callMain(feedbackMain, ["suggest"]));
  return 0;
}

async function cmdDocs(flags: Flags, state: PipelineState): Promise<number> {
  const naming = loadConfig();
  const tracker = getTracker();
  const results: Array<{ file: string; status: string; pages: number | null }> = [];
  let failed = 0;

  // Personal application documents live under the grouped tree; templates are
  // flat, get compiled but not reevaluated (no candidate data to gate).
  const typExt = new Set([".typ"]);
  const personal = walkDocuments(join(ROOT, naming.applicationsDir), typExt).map((p) => ({ filePath: p, personal: true }));
  const templates = ["templates/cv/banking", "templates/cover/classic"].flatMap((d) =>
    walkDocuments(join(ROOT, d), typExt).map((p) => ({ filePath: p, personal: false })),
  );

  try {
    for (const { filePath, personal: isPersonalDoc } of [...personal, ...templates]) {
      const rel = filePath.replace(ROOT + "/", "");
      if (flags.company && !basename(filePath).toLowerCase().includes(flags.company.toLowerCase())) continue;
      const ok = await runStep(state, `docs:${rel}`, flags.resume ?? false, async () => {
        const result = await compile(filePath);
        if (result.status !== "success") throw new Error(result.error ?? "compile failed");
        results.push({ file: rel, status: result.status, pages: result.pages });
        let verdict: string | undefined;
        if (isPersonalDoc) {
          const report = await reevaluateDoc(filePath, /_CL\./.test(filePath) ? "cl" : "cv");
          verdict = report.pass
            ? "pass"
            : `fail:${report.gates.filter((g) => g.pass === false).map((g) => g.gate).join(",")}`;
        }
        tracker.addDocumentVersion({
          file_path: filePath.replace(/\.typ$/, ".pdf"),
          template_used: rel.includes("templates/") ? rel.split("/").pop() : undefined,
          company: flags.company,
          reevaluation: verdict,
        });
        return `${result.pages ?? "?"} pages${verdict ? `, reevaluation ${verdict}` : ""}`;
      });
      if (!ok) failed++;
    }
  } finally {
    closeTracker();
  }

  process.stdout.write(JSON.stringify({ compiled: results.length, failed, results }, null, 2) + "\n");
  return failed > 0 ? 1 : 0;
}

async function cmdWeekly(flags: Flags, state: PipelineState): Promise<number> {
  const ok = await runStep(state, "weekly-report", flags.resume ?? false, () => {
    const dashboard = buildDashboard();
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const tracker = getTracker();
    const thisWeek = tracker.list().filter((a) => a.date >= weekAgo);
    const recentVerdicts = tracker.database
      .prepare(
        "SELECT file_path, reevaluation, created_at FROM document_versions WHERE reevaluation IS NOT NULL AND created_at >= ? ORDER BY id DESC LIMIT 10"
      )
      .all(weekAgo) as Array<{ file_path: string; reevaluation: string; created_at: string }>;
    closeTracker();

    const seenParsed = SeenJobsFile.safeParse(
      existsSync(SEEN_JOBS_PATH) ? JSON.parse(readFileSync(SEEN_JOBS_PATH, "utf-8")) : { seen: {} }
    );
    const seen = seenParsed.success ? seenParsed.data : { seen: {} };
    const snapshot = buildSnapshot(Object.values(seen.seen), today);
    const alerts = pendingAlerts(seen);

    const lines: string[] = [];
    lines.push(`# Weekly Review — ${today}`);
    lines.push("");
    lines.push("## Applications This Week");
    lines.push("");
    if (thisWeek.length === 0) lines.push("_No applications recorded this week._");
    for (const a of thisWeek) lines.push(`- ${a.date} — **${a.company}** ${a.role} [${a.status}]${a.channel ? ` via ${a.channel}` : ""}`);
    lines.push("");
    lines.push("## Pipeline");
    lines.push("");
    lines.push(`- Total tracked: ${dashboard.pipeline.total}`);
    for (const [status, count] of Object.entries(dashboard.pipeline.byStatus)) lines.push(`- ${status}: ${count}`);
    lines.push("");
    lines.push("## Response Metrics");
    lines.push("");
    lines.push(`- Outcomes recorded: ${dashboard.responseMetrics.outcomesRecorded}`);
    lines.push(`- Response rate: ${dashboard.responseMetrics.responseRate ?? "n/a"}`);
    lines.push(`- Interview rate: ${dashboard.responseMetrics.interviewRate ?? "n/a"}`);
    lines.push(`- Avg response days: ${dashboard.responseMetrics.avgResponseDays ?? "n/a"}`);
    lines.push("");
    lines.push("## Top Insights");
    lines.push("");
    if (dashboard.topRejectionReasons.length === 0) lines.push("_No rejection reasons recorded yet._");
    for (const r of dashboard.topRejectionReasons) lines.push(`- Recurring rejection reason: ${r}`);
    lines.push(`- Reasoning entries on file: ${dashboard.reasoningEntries}`);
    lines.push("");
    lines.push("## Market Snapshot");
    lines.push("");
    lines.push(`- Jobs tracked: ${snapshot.totalJobs} (${Object.entries(snapshot.byMarket).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"})`);
    lines.push(`- Top skills in demand: ${snapshot.topSkills.slice(0, 8).map((s) => `${s.skill} (${s.count})`).join(", ") || "none detected"}`);
    lines.push("");
    lines.push("## Unreviewed Job Alerts");
    lines.push("");
    lines.push(alerts.length === 0 ? "_All scraped jobs triaged._" : `- ${alerts.length} jobs still marked new — top 5:`);
    for (const a of alerts.slice(0, 5)) lines.push(`  - [${a.fit}] ${a.title} — ${a.company} (${a.market})`);
    lines.push("");
    lines.push("## Document Quality (reevaluation verdicts this week)");
    lines.push("");
    if (recentVerdicts.length === 0) lines.push("_No documents gated this week._");
    for (const v of recentVerdicts) lines.push(`- ${v.reevaluation === "pass" ? "✓" : "✗"} ${v.file_path.split("/").pop()} — ${v.reevaluation}`);
    lines.push("");
    lines.push("## Action Items");
    lines.push("");
    lines.push(`- Pending follow-ups: ${dashboard.pendingFollowups} (run \`bun run followup pending\`)`);
    if (alerts.length > 0) lines.push(`- Triage ${alerts.length} new jobs: \`bun run alerts list --format text\``);
    if (dashboard.channels.length > 0) lines.push(`- Most used channel: ${dashboard.channels[0].channel} (${dashboard.channels[0].applications} applications)`);
    lines.push("");

    mkdirSync(REPORTS_DIR, { recursive: true });
    const outPath = join(REPORTS_DIR, `weekly-${today}.md`);
    writeFileSync(outPath, lines.join("\n"));
    return `data/reports/weekly-${today}.md`;
  });
  return ok ? 0 : 1;
}

async function cmdFull(flags: Flags, state: PipelineState): Promise<number> {
  const jobInput = flags.job;
  if (!jobInput) {
    process.stderr.write(JSON.stringify({ error: "pipeline full requires --job <file>", code: "NO_JOB" }) + "\n");
    return 1;
  }
  if (!existsSync(jobInput)) {
    process.stderr.write(JSON.stringify({ error: `Job file not found: ${jobInput}`, code: "NOT_FOUND" }) + "\n");
    return 1;
  }
  const resume = flags.resume ?? false;

  let profileFresh = loadProfile() !== null;
  if (!profileFresh) {
    await runStep(state, "profile", resume, () => callMain(buildProfileMain, ["--skip-blog"]));
    profileFresh = loadProfile() !== null;
  }
  if (!profileFresh) {
    process.stderr.write(JSON.stringify({ error: "No usable profile. Run: bun run profile", code: "NO_PROFILE" }) + "\n");
    return 1;
  }

  let score = 0;
  let gaps: string[] = [];
  const postingText = readFileSync(jobInput, "utf-8");
  const parsed = summarizeText(postingText, {
    title: flags.title,
    company: flags.company,
  });

  const s1 = await runStep(state, "score", resume, () => {
    const profile = loadProfile()!;
    const result = scoreJob(parsed, profile);
    score = result.score;
    gaps = result.gaps;
    return `score ${result.score}/100, ${result.gaps.length} gaps`;
  });
  if (!s1) return 1;

  let templates: { cv: string | null; cover: string | null; confidence: string; warnings: string[] } | null = null;
  await runStep(state, "select-template", resume, () => {
    const registry = loadRegistry(join(CODE_ROOT, "templates"));
    const selection = selectTemplates(postingText, loadProfile(), registry, {
      photoAvailable: existsSync(join(ROOT, "assets", "photos", "profile.jpg")),
    });
    templates = {
      cv: selection.selected.cv,
      cover: selection.selected.cover,
      confidence: selection.confidence.level,
      warnings: selection.warnings,
    };
    return `cv=${selection.selected.cv ?? "none"} cover=${selection.selected.cover ?? "none"} (confidence: ${selection.confidence.level})`;
  });

  const s2 = await runStep(state, "track", resume, () => {
    const tracker = getTracker();
    try {
      const company = flags.company ?? parsed.company ?? "unknown";
      const app = tracker.insert({
        id: generateApplicationId(company),
        date: new Date().toISOString().slice(0, 10),
        company,
        role: flags.title ?? parsed.title ?? "unknown role",
        status: "planning",
        fit_rating: score,
        notes: gaps.length > 0 ? `gaps: ${gaps.join("; ")}` : undefined,
      });
      return `tracked as ${app.id}`;
    } finally {
      closeTracker();
    }
  });

  process.stdout.write(
    JSON.stringify(
      {
        job: jobInput,
        parsed,
        score,
        gaps,
        templates,
        tracked: s2,
        nextSteps: [
          score >= 75 ? "Good fit — generate documents with the /apply skill (tailored CV + cover letter need LLM writing)" : "Below 75 — review gaps before investing in documents",
          "bun run pipeline:docs — recompile existing documents",
          "bun run outcome set ... — record the outcome after applying",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  return s2 ? 0 : 1;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const HELP = `pipeline — Orchestrate end-to-end job search workflows

USAGE
  bun run scripts/pipeline/cli.ts <command> [flags]

COMMANDS
  full --job <file>     Parse + score a job, select templates, track it, suggest next steps
  profile               Update profile from all sources (github, staging, sync)
  scrape --query <q>    Run portal scrapers, dedup vs data/seen-jobs.json
  reason                Analyze outcomes and print profile suggestions for review
  docs [--company X]    Recompile all .typ documents, record versions
  weekly                Generate weekly review report (data/reports/)

FLAGS
  --help, -h            Show this help message
  --resume              Skip steps already completed in data/pipeline-state.json
  --job <file>          Job description file (full)
  --title <text>        Job title (full)
  --company <text>      Company name (full, docs)
  --query <text>        Search query (scrape)
  --portals <list>      Comma-separated portals (scrape). Default: all.
                        Available: ${Object.keys(PORTALS).join(", ")}
  --skip-github         Skip GitHub fetch (profile)

NOTES
  reason never edits data/profile.json. After reviewing suggestions, apply an
  explicit change with: bun run feedback suggest --apply

STATE
  Progress saved to data/pipeline-state.json after every step.
  Interrupted runs resume with --resume (completed steps are skipped).

OUTPUT
  JSON lines per step + final JSON summary to stdout
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = any step failed
`;

interface Flags {
  _: string[];
  help?: boolean;
  resume?: boolean;
  job?: string;
  title?: string;
  company?: string;
  query?: string;
  portals?: string;
  "skip-github"?: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--resume") flags.resume = true;
    else if (a === "--skip-github") flags["skip-github"] = true;
    else if (a === "--job") flags.job = argv[++i];
    else if (a === "--title") flags.title = argv[++i];
    else if (a === "--company") flags.company = argv[++i];
    else if (a === "--query") flags.query = argv[++i];
    else if (a === "--portals") flags.portals = argv[++i];
    else if (!a.startsWith("-")) flags._.push(a);
  }
  return flags;
}

export async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help || flags._.length === 0) {
    process.stdout.write(HELP);
    return flags.help ? 0 : 1;
  }

  const cmd = flags._[0];
  const state = newState(cmd, flags.resume ?? false);

  let code: number;
  switch (cmd) {
    case "full":
      code = await cmdFull(flags, state);
      break;
    case "profile":
      code = await cmdProfile(flags, state);
      break;
    case "scrape":
      code = await cmdScrape(flags, state);
      break;
    case "reason":
      code = await cmdReason(flags, state);
      break;
    case "docs":
      code = await cmdDocs(flags, state);
      break;
    case "weekly":
      code = await cmdWeekly(flags, state);
      break;
    default:
      process.stderr.write(JSON.stringify({ error: `Unknown command: ${cmd}. Use full, profile, scrape, reason, docs, or weekly.`, code: "BAD_CMD" }) + "\n");
      return 1;
  }

  state.finishedAt = new Date().toISOString();
  saveState(state);
  return code;
}

if (import.meta.main) main().then((code) => process.exit(code));
