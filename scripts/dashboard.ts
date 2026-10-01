#!/usr/bin/env bun
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { getTracker, closeTracker } from "../src/tracker.js";
import { ReasoningLog, ApplicationOutcome } from "../src/profile-schemas.js";
import { z } from "zod";
import { pendingFollowups } from "./followup.js";
import { WORKSPACE as ROOT } from "../src/paths.js";

const OUTCOMES_PATH = join(ROOT, "data", "outcomes.json");
const REASONING_PATH = join(ROOT, "data", "reasoning.json");

const OutcomesFile = z.array(ApplicationOutcome);

export interface DashboardData {
  pipeline: { total: number; byStatus: Record<string, number> };
  responseMetrics: {
    outcomesRecorded: number;
    responseRate: number | null;
    interviewRate: number | null;
    avgResponseDays: number | null;
  };
  channels: Array<{ channel: string; applications: number }>;
  topRejectionReasons: string[];
  pendingFollowups: number;
  recentActivity: Array<{ id: string; company: string; role: string; status: string; date: string }>;
  reasoningEntries: number;
}

export function buildDashboard(): DashboardData {
  const tracker = getTracker();
  const apps = tracker.list();
  const stats = tracker.stats();

  let outcomes: ApplicationOutcome[] = [];
  if (existsSync(OUTCOMES_PATH)) {
    try {
      const parsed = OutcomesFile.safeParse(JSON.parse(readFileSync(OUTCOMES_PATH, "utf-8")));
      if (parsed.success) outcomes = parsed.data;
    } catch {
      outcomes = [];
    }
  }

  let reasoning: ReasoningLog = { entries: [] };
  if (existsSync(REASONING_PATH)) {
    try {
      const parsed = ReasoningLog.safeParse(JSON.parse(readFileSync(REASONING_PATH, "utf-8")));
      if (parsed.success) reasoning = parsed.data;
    } catch {
      reasoning = { entries: [] };
    }
  }

  const responded = outcomes.filter((o) => o.status !== "no_response" && o.status !== "planning" && o.status !== "applied");
  const interviews = outcomes.filter((o) => (o.interviewCount ?? 0) > 0 || o.status === "interviewing" || o.status === "offered");
  const responseDays = outcomes.map((o) => o.responseTimeDays).filter((d): d is number => typeof d === "number");

  const channelCounts = new Map<string, number>();
  for (const app of apps) {
    if (app.channel) channelCounts.set(app.channel, (channelCounts.get(app.channel) ?? 0) + 1);
  }

  const rejectionCounts = new Map<string, number>();
  for (const o of outcomes) {
    if (o.rejectionReason) rejectionCounts.set(o.rejectionReason, (rejectionCounts.get(o.rejectionReason) ?? 0) + 1);
  }

  return {
    pipeline: { total: stats.total, byStatus: stats.by_status },
    responseMetrics: {
      outcomesRecorded: outcomes.length,
      responseRate: outcomes.length > 0 ? Math.round((responded.length / outcomes.length) * 100) / 100 : null,
      interviewRate: outcomes.length > 0 ? Math.round((interviews.length / outcomes.length) * 100) / 100 : null,
      avgResponseDays: responseDays.length > 0 ? Math.round((responseDays.reduce((a, b) => a + b, 0) / responseDays.length) * 10) / 10 : null,
    },
    channels: [...channelCounts.entries()]
      .map(([channel, applications]) => ({ channel, applications }))
      .sort((a, b) => b.applications - a.applications),
    topRejectionReasons: [...rejectionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason]) => reason),
    pendingFollowups: pendingFollowups(apps, 7).length,
    recentActivity: apps.slice(0, 10).map((a) => ({ id: a.id, company: a.company, role: a.role, status: a.status, date: a.date })),
    reasoningEntries: reasoning.entries.length,
  };
}

function renderText(d: DashboardData): string {
  const lines: string[] = [];
  lines.push("── Pipeline ──");
  lines.push(`  total: ${d.pipeline.total}`);
  for (const [status, count] of Object.entries(d.pipeline.byStatus)) {
    lines.push(`  ${status}: ${count}`);
  }
  lines.push("── Response Metrics ──");
  lines.push(`  outcomes recorded: ${d.responseMetrics.outcomesRecorded}`);
  lines.push(`  response rate: ${d.responseMetrics.responseRate ?? "n/a"}`);
  lines.push(`  interview rate: ${d.responseMetrics.interviewRate ?? "n/a"}`);
  lines.push(`  avg response days: ${d.responseMetrics.avgResponseDays ?? "n/a"}`);
  lines.push("── Channels ──");
  if (d.channels.length === 0) lines.push("  (none recorded)");
  for (const c of d.channels) lines.push(`  ${c.channel}: ${c.applications}`);
  lines.push("── Top Rejection Reasons ──");
  if (d.topRejectionReasons.length === 0) lines.push("  (none recorded)");
  for (const r of d.topRejectionReasons) lines.push(`  ${r}`);
  lines.push(`── Pending Follow-ups: ${d.pendingFollowups} (run: bun run followup pending) ──`);
  lines.push("── Recent Activity ──");
  if (d.recentActivity.length === 0) lines.push("  (no applications tracked)");
  for (const a of d.recentActivity) lines.push(`  ${a.date} ${a.company} — ${a.role} [${a.status}]`);
  lines.push(`── Reasoning entries: ${d.reasoningEntries} ──`);
  return lines.join("\n") + "\n";
}

const HELP = `dashboard — Unified pipeline status view

USAGE
  bun run scripts/dashboard.ts [--format json|text]

FLAGS
  --help, -h          Show this help message
  --format <fmt>      Output format: text (default) or json

SECTIONS
  Pipeline counts by status · response metrics · channel rankings ·
  top rejection reasons · pending follow-ups · recent activity ·
  reasoning entry count.

DATA SOURCES
  data/tracker.db · data/outcomes.json · data/reasoning.json

OUTPUT
  Formatted dashboard (text) or JSON to stdout
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error
`;

interface Flags {
  help?: boolean;
  format?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--format") flags.format = argv[++i];
  }
  return flags;
}

export function main(): number {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }

  if (flags.format && flags.format !== "json" && flags.format !== "text") {
    process.stderr.write(JSON.stringify({ error: `Unknown format: ${flags.format}. Use json or text.`, code: "BAD_FLAG" }) + "\n");
    return 1;
  }

  try {
    const data = buildDashboard();
    process.stdout.write(flags.format === "json" ? JSON.stringify(data, null, 2) + "\n" : renderText(data));
    return 0;
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err instanceof Error ? err.message : String(err), code: "DASHBOARD_FAILED" }) + "\n");
    return 1;
  } finally {
    closeTracker();
  }
}

if (import.meta.main) process.exit(main());
