#!/usr/bin/env bun
// reason.ts — Record and query reasoning entries.
// Tier 1 CLI: parseFlags, JSON stdout, error JSON to stderr, exit 0/1.
//
// Usage:
//   bun run scripts/profile/reason.ts log --type skill_gap --finding "..." --confidence high
//   bun run scripts/profile/reason.ts analyze
//   bun run scripts/profile/reason.ts query --type skill_gap
//   bun run scripts/profile/reason.ts summary
//   bun run scripts/profile/reason.ts --help

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ReasoningLog,
  ReasoningEntry,
  generateReasoningId,
} from "../../src/profile-schemas.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";

// ─── Configuration ────────────────────────────────────────────────────────

const REASONING_PATH = join(ROOT, "data", "reasoning.json");
const OUTCOMES_PATH = join(ROOT, "data", "outcomes.json");

// ─── Help ─────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";

const HELP = `reason — Record and query reasoning entries

USAGE
  bun run scripts/profile/reason.ts log [flags]       Log a reasoning entry
  bun run scripts/profile/reason.ts analyze            Scan outcomes, compute summary stats
  bun run scripts/profile/reason.ts query [flags]      Query entries by type
  bun run scripts/profile/reason.ts summary            Print summary stats
  bun run scripts/profile/reason.ts list               Show all entries

LOG FLAGS
  --type <type>         Entry type (channel_effectiveness|template_effectiveness|skill_gap|sector_fit|cover_letter_style|timing|general)
  --finding <text>      What was learned (required)
  --evidence <text>     Supporting data point (repeatable)
  --confidence <level>  low|medium|high (required)
  --action <text>       What to change in profile/strategy

QUERY FLAGS
  --type <type>         Filter by type

OUTPUT
  JSON to stdout
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error
`;

// ─── Parse Flags ──────────────────────────────────────────────────────────

interface Flags {
  _: string[];
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
  type?: string;
  finding?: string;
  evidence?: string[];
  confidence?: string;
  action?: string;
  list?: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [], evidence: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-v") flags.version = true;
    else if (a === "--type") flags.type = argv[++i];
    else if (a === "--finding") flags.finding = argv[++i];
    else if (a === "--evidence") flags.evidence!.push(argv[++i]);
    else if (a === "--confidence") flags.confidence = argv[++i];
    else if (a === "--action") flags.action = argv[++i];
    else if (a === "list") flags.list = true;
    else if (a.startsWith("-")) {
      // unknown flag
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

// ─── Data Access ──────────────────────────────────────────────────────────

function loadReasoningLog(): ReasoningLog {
  if (!existsSync(REASONING_PATH)) {
    return { entries: [] };
  }
  try {
    const raw = readFileSync(REASONING_PATH, "utf-8");
    return JSON.parse(raw) as ReasoningLog;
  } catch {
    return { entries: [] };
  }
}

function saveReasoningLog(log: ReasoningLog): void {
  mkdirSync(join(REASONING_PATH, ".."), { recursive: true });
  writeFileSync(REASONING_PATH, JSON.stringify(log, null, 2) + "\n");
}

// ─── Commands ─────────────────────────────────────────────────────────────

function cmdLog(flags: Flags): number {
  if (!flags.type) {
    process.stderr.write(
      JSON.stringify({ error: "--type is required", code: "NO_TYPE" }) + "\n",
    );
    return 1;
  }

  if (!flags.finding) {
    process.stderr.write(
      JSON.stringify({ error: "--finding is required", code: "NO_FINDING" }) + "\n",
    );
    return 1;
  }

  if (!flags.confidence) {
    process.stderr.write(
      JSON.stringify({ error: "--confidence is required (low|medium|high)", code: "NO_CONFIDENCE" }) + "\n",
    );
    return 1;
  }

  const validTypes = [
    "channel_effectiveness",
    "template_effectiveness",
    "skill_gap",
    "sector_fit",
    "cover_letter_style",
    "timing",
    "general",
  ];
  if (!validTypes.includes(flags.type)) {
    process.stderr.write(
      JSON.stringify({
        error: `Invalid type: ${flags.type}. Must be one of: ${validTypes.join(", ")}`,
        code: "BAD_TYPE",
      }) + "\n",
    );
    return 1;
  }

  const validConfidence = ["low", "medium", "high"];
  if (!validConfidence.includes(flags.confidence)) {
    process.stderr.write(
      JSON.stringify({
        error: `Invalid confidence: ${flags.confidence}. Must be one of: ${validConfidence.join(", ")}`,
        code: "BAD_CONFIDENCE",
      }) + "\n",
    );
    return 1;
  }

  const evidence = (flags.evidence ?? []).map((data) => ({ data }));

  const entry: ReasoningEntry = {
    id: generateReasoningId(flags.type),
    date: new Date().toISOString().slice(0, 10),
    type: flags.type as ReasoningEntry["type"],
    finding: flags.finding,
    evidence,
    confidence: flags.confidence as "low" | "medium" | "high",
    actionItem: flags.action,
    applied: false,
  };

  const parsed = ReasoningEntry.safeParse(entry);
  if (!parsed.success) {
    process.stderr.write(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.issues,
        code: "VALIDATION_ERROR",
      }) + "\n",
    );
    return 1;
  }

  const log = loadReasoningLog();
  log.entries.push(parsed.data);
  saveReasoningLog(log);

  process.stdout.write(
    JSON.stringify(
      {
        status: "recorded",
        id: parsed.data.id,
        type: parsed.data.type,
        confidence: parsed.data.confidence,
        totalEntries: log.entries.length,
      },
      null,
      2,
    ) + "\n",
  );

  return 0;
}

function cmdAnalyze(): number {
  // Load outcomes
  let outcomes: Record<string, unknown>[] = [];
  if (existsSync(OUTCOMES_PATH)) {
    try {
      outcomes = JSON.parse(readFileSync(OUTCOMES_PATH, "utf-8")) as Record<string, unknown>[];
    } catch {
      // empty
    }
  }

  const total = outcomes.length;
  const responded = outcomes.filter(
    (o) =>
      o.status !== "applied" && o.status !== "no_response",
  ).length;
  const interviews = outcomes.filter(
    (o) => o.status === "interviewing" || o.status === "offered",
  ).length;
  const offers = outcomes.filter(
    (o) => o.status === "offered",
  ).length;
  const rejections = outcomes.filter(
    (o) => o.status === "rejected",
  ).length;

  // Channel effectiveness
  const byChannel = new Map<string, { total: number; responded: number }>();
  for (const o of outcomes) {
    const rec = o as Record<string, unknown>;
    const ch = (rec.channel as string) ?? "unknown";
    if (!byChannel.has(ch)) byChannel.set(ch, { total: 0, responded: 0 });
    const stats = byChannel.get(ch)!;
    stats.total++;
    if (rec.status !== "applied" && rec.status !== "no_response") {
      stats.responded++;
    }
  }

  let bestChannel: string | undefined;
  let bestRate = 0;
  for (const [ch, stats] of byChannel) {
    const rate = stats.total > 0 ? stats.responded / stats.total : 0;
    if (rate > bestRate) {
      bestRate = rate;
      bestChannel = ch;
    }
  }

  // Top rejection reasons
  const reasons = new Map<string, number>();
  for (const o of outcomes) {
    const rec = o as Record<string, unknown>;
    if (rec.status === "rejected" && rec.rejectionReason) {
      const r = rec.rejectionReason as string;
      reasons.set(r, (reasons.get(r) ?? 0) + 1);
    }
  }
  const topRejectionReasons = [...reasons.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([r]) => r);

  // Avg response days
  const responseDays = outcomes
    .map((o) => o.responseTimeDays as number | undefined)
    .filter((d): d is number => typeof d === "number" && d > 0);
  const avgResponseDays =
    responseDays.length > 0
      ? responseDays.reduce((a, b) => a + b, 0) / responseDays.length
      : undefined;

  const summary = {
    totalApplications: total,
    responseRate: total > 0 ? responded / total : 0,
    interviewRate: total > 0 ? interviews / total : 0,
    offerRate: total > 0 ? offers / total : 0,
    bestChannel,
    avgResponseDays,
    topRejectionReasons: topRejectionReasons.length > 0 ? topRejectionReasons : undefined,
    lastAnalyzed: new Date().toISOString(),
  };

  // Save to reasoning log
  const log = loadReasoningLog();
  log.summary = summary;
  saveReasoningLog(log);

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  return 0;
}

function cmdQuery(flags: Flags): number {
  if (!flags.type) {
    process.stderr.write(
      JSON.stringify({ error: "--type is required for query", code: "NO_TYPE" }) + "\n",
    );
    return 1;
  }

  const log = loadReasoningLog();
  const filtered = log.entries.filter((e) => e.type === flags.type);
  process.stdout.write(JSON.stringify(filtered, null, 2) + "\n");
  return 0;
}

function cmdSummary(): number {
  const log = loadReasoningLog();
  if (!log.summary) {
    process.stdout.write(
      JSON.stringify({ message: "No summary yet. Run 'analyze' first." }) + "\n",
    );
    return 0;
  }
  process.stdout.write(JSON.stringify(log.summary, null, 2) + "\n");
  return 0;
}

function cmdList(): number {
  const log = loadReasoningLog();
  process.stdout.write(JSON.stringify(log.entries, null, 2) + "\n");
  return 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────

export function main(): number {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help || flags.h) {
    process.stdout.write(HELP);
    return 0;
  }

  if (flags.version || flags.v) {
    process.stdout.write(`reason version ${VERSION}\n`);
    return 0;
  }

  if (flags.list) return cmdList();

  const cmd = flags._[0];
  if (cmd === "log") return cmdLog(flags);
  if (cmd === "analyze") return cmdAnalyze();
  if (cmd === "query") return cmdQuery(flags);
  if (cmd === "summary") return cmdSummary();

  process.stderr.write(
    JSON.stringify({
      error: `Unknown command: ${cmd ?? "(none)"}. Use log, analyze, query, summary, or list.`,
      code: "BAD_CMD",
    }) + "\n",
  );
  return 1;
}

if (import.meta.main) process.exit(main());
