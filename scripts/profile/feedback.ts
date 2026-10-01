#!/usr/bin/env bun
// feedback.ts — Analyze reasoning log and suggest profile changes.
// Tier 1 CLI: parseFlags, JSON stdout, error JSON to stderr, exit 0/1.
//
// Usage:
//   bun run scripts/profile/feedback.ts gaps
//   bun run scripts/profile/feedback.ts channels
//   bun run scripts/profile/feedback.ts templates
//   bun run scripts/profile/feedback.ts suggest [--apply]
//   bun run scripts/profile/feedback.ts --help

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ReasoningLog,
  Profile,
} from "../../src/profile-schemas.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";

// ─── Configuration ────────────────────────────────────────────────────────

const REASONING_PATH = join(ROOT, "data", "reasoning.json");
const PROFILE_PATH = join(ROOT, "data", "profile.json");

// ─── Help ─────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";

const HELP = `feedback — Analyze reasoning log and suggest profile changes

USAGE
  bun run scripts/profile/feedback.ts gaps         List skill gaps from rejections
  bun run scripts/profile/feedback.ts channels     Rank job boards by response rate
  bun run scripts/profile/feedback.ts templates    Rank CV templates by response rate
  bun run scripts/profile/feedback.ts suggest      Produce actionable suggestions
  bun run scripts/profile/feedback.ts suggest --apply  Auto-apply suggestions to profile

FLAGS
  --help, -h          Show this help message
  --version, -v       Show version
  --apply             Auto-apply suggestions to data/profile.json

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
  apply?: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-v") flags.version = true;
    else if (a === "--apply") flags.apply = true;
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
  if (!existsSync(REASONING_PATH)) return { entries: [] };
  try {
    return JSON.parse(readFileSync(REASONING_PATH, "utf-8")) as ReasoningLog;
  } catch {
    return { entries: [] };
  }
}

function loadProfile(): Profile | null {
  if (!existsSync(PROFILE_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(PROFILE_PATH, "utf-8"));
    const parsed = Profile.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function saveProfile(profile: Profile): void {
  mkdirSync(join(PROFILE_PATH, ".."), { recursive: true });
  writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2) + "\n");
}

function saveReasoningLog(log: ReasoningLog): void {
  mkdirSync(join(REASONING_PATH, ".."), { recursive: true });
  writeFileSync(REASONING_PATH, JSON.stringify(log, null, 2) + "\n");
}

// ─── Commands ─────────────────────────────────────────────────────────────

interface Suggestion {
  action: string;
  evidence: string[];
  confidence: string;
}

interface RankedItem {
  findings: number;
  confidence: string;
  evidence: string[];
}

function rankEntries(
  entries: ReasoningLog["entries"],
  entryType: string,
): Array<{ key: string } & RankedItem> {
  const byKey = new Map<string, RankedItem>();
  for (const entry of entries.filter((e) => e.type === entryType)) {
    const key = entry.evidence[0]?.data ?? "unknown";
    if (!byKey.has(key)) {
      byKey.set(key, { findings: 0, confidence: "low", evidence: [] });
    }
    const stats = byKey.get(key)!;
    stats.findings++;
    if (entry.confidence === "high") stats.confidence = "high";
    else if (entry.confidence === "medium" && stats.confidence !== "high")
      stats.confidence = "medium";
    stats.evidence.push(entry.finding);
  }
  return [...byKey.entries()]
    .map(([key, stats]) => ({ key, ...stats }))
    .sort((a, b) => b.findings - a.findings);
}

function cmdGaps(): number {
  const log = loadReasoningLog();

  // Find skill_gap entries with confidence >= medium, cited in 2+ rejections
  const skillGaps = log.entries.filter(
    (e) =>
      e.type === "skill_gap" &&
      (e.confidence === "medium" || e.confidence === "high"),
  );

  // Group by finding text (fuzzy)
  const grouped = new Map<string, { count: number; evidence: string[]; confidence: string }>();
  for (const entry of skillGaps) {
    const key = entry.finding.toLowerCase().trim();
    if (!grouped.has(key)) {
      grouped.set(key, {
        count: 0,
        evidence: entry.evidence.map((e) => e.data),
        confidence: entry.confidence,
      });
    }
    const g = grouped.get(key)!;
    g.count++;
    for (const e of entry.evidence) {
      if (!g.evidence.includes(e.data)) g.evidence.push(e.data);
    }
    // Upgrade confidence if any entry is high
    if (entry.confidence === "high") g.confidence = "high";
  }

  const gaps = [...grouped.entries()]
    .filter(([, g]) => g.count >= 2)
    .map(([finding, g]) => ({
      finding,
      citations: g.count,
      evidence: g.evidence,
      confidence: g.confidence,
    }))
    .sort((a, b) => b.citations - a.citations);

  process.stdout.write(JSON.stringify({ gaps }, null, 2) + "\n");
  return 0;
}

function cmdChannels(): number {
  const log = loadReasoningLog();
  const channelRanking = rankEntries(log.entries, "channel_effectiveness").map(
    ({ key, ...rest }) => ({ channel: key, ...rest }),
  );

  process.stdout.write(
    JSON.stringify(
      {
        channels: channelRanking,
        summaryBestChannel: log.summary?.bestChannel,
      },
      null,
      2,
    ) + "\n",
  );
  return 0;
}

function cmdTemplates(): number {
  const log = loadReasoningLog();
  const templateRanking = rankEntries(log.entries, "template_effectiveness").map(
    ({ key, ...rest }) => ({ template: key, ...rest }),
  );

  process.stdout.write(
    JSON.stringify(
      {
        templates: templateRanking,
        summaryBestTemplate: log.summary?.bestTemplate,
      },
      null,
      2,
    ) + "\n",
  );
  return 0;
}

function cmdSuggest(flags: Flags): number {
  const log = loadReasoningLog();
  const profile = loadProfile();

  const suggestions: Suggestion[] = [];

  // Skill gap suggestions
  const skillGaps = log.entries.filter(
    (e) =>
      e.type === "skill_gap" &&
      (e.confidence === "medium" || e.confidence === "high"),
  );
  const gapCounts = new Map<string, { count: number; evidence: string[] }>();
  for (const entry of skillGaps) {
    const key = entry.finding.toLowerCase();
    if (!gapCounts.has(key)) gapCounts.set(key, { count: 0, evidence: [] });
    const g = gapCounts.get(key)!;
    g.count++;
    for (const e of entry.evidence) {
      if (!g.evidence.includes(e.data)) g.evidence.push(e.data);
    }
  }

  for (const [finding, g] of gapCounts) {
    if (g.count >= 2) {
      suggestions.push({
        action: `Add '${finding}' to skills if applicable`,
        evidence: g.evidence,
        confidence: g.count >= 3 ? "high" : "medium",
      });
    }
  }

  // Channel suggestions
  if (log.summary?.bestChannel) {
    suggestions.push({
      action: `Prioritize ${log.summary.bestChannel} for job applications`,
      evidence: [`Best response channel per analysis`],
      confidence: "medium",
    });
  }

  // Template suggestions
  if (log.summary?.bestTemplate) {
    suggestions.push({
      action: `Use ${log.summary.bestTemplate} template as default`,
      evidence: [`Best performing template per analysis`],
      confidence: "medium",
    });
  }

  // Rejection reason patterns
  if (log.summary?.topRejectionReasons?.length) {
    for (const reason of log.summary.topRejectionReasons.slice(0, 3)) {
      suggestions.push({
        action: `Address recurring rejection: "${reason}"`,
        evidence: [`Top rejection reason`],
        confidence: "medium",
      });
    }
  }

  // Apply if requested
  if (flags.apply && profile) {
    // Mark actioned suggestions
    for (const entry of log.entries) {
      if (entry.actionItem && !entry.applied) {
        entry.applied = true;
      }
    }
    saveReasoningLog(log);

    process.stdout.write(
      JSON.stringify(
        {
          suggestions,
          applied: true,
          message: "Suggestions recorded. Profile changes require manual review.",
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(JSON.stringify({ suggestions }, null, 2) + "\n");
  }

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
    process.stdout.write(`feedback version ${VERSION}\n`);
    return 0;
  }

  const cmd = flags._[0];
  if (cmd === "gaps") return cmdGaps();
  if (cmd === "channels") return cmdChannels();
  if (cmd === "templates") return cmdTemplates();
  if (cmd === "suggest") return cmdSuggest(flags);

  process.stderr.write(
    JSON.stringify({
      error: `Unknown command: ${cmd ?? "(none)"}. Use gaps, channels, templates, or suggest.`,
      code: "BAD_CMD",
    }) + "\n",
  );
  return 1;
}

if (import.meta.main) process.exit(main());
