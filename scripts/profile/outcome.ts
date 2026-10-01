#!/usr/bin/env bun
// outcome.ts — Record application outcomes and prompt for reasoning entries.
// Tier 1 CLI: parseFlags, JSON stdout, error JSON to stderr, exit 0/1.
//
// Usage:
//   bun run scripts/profile/outcome.ts set <app-id> --status rejected --reason "..."
//   bun run scripts/profile/outcome.ts bulk --from outcomes.csv
//   bun run scripts/profile/outcome.ts --help

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ApplicationOutcome,
  type ApplicationStatus,
} from "../../src/profile-schemas.js";
import { closeTracker, getTracker } from "../../src/tracker.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";

// ─── Configuration ────────────────────────────────────────────────────────

const OUTCOMES_PATH = join(ROOT, "data", "outcomes.json");

// ─── Help ─────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";

const HELP = `outcome — Record application outcomes

USAGE
  bun run scripts/profile/outcome.ts set <app-id> [flags]
  bun run scripts/profile/outcome.ts bulk --from <csv-path>
  bun run scripts/profile/outcome.ts list

SET FLAGS
  --status <status>     Application status (applied|interviewing|offered|rejected|withdrawn|no_response)
  --reason <text>       Rejection reason (if applicable)
  --response-days <n>   Days from application to first response
  --interviews <n>      Number of interviews
  --notes <text>        Additional notes
  --template <name>     CV template used
  --cover-letter        Whether a cover letter was used (boolean flag)
  --channel <name>      Job board/referral source

BULK FLAGS
  --from <csv-path>     CSV file with columns: id,company,role,sector,channel,status,date,response_days,interviews,reason,notes

LIST
  bun run scripts/profile/outcome.ts list    — Show all recorded outcomes

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
  status?: string;
  reason?: string;
  "response-days"?: string;
  interviews?: string;
  notes?: string;
  template?: string;
  "cover-letter"?: boolean;
  channel?: string;
  from?: string;
  list?: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-v") flags.version = true;
    else if (a === "--status") flags.status = argv[++i];
    else if (a === "--reason") flags.reason = argv[++i];
    else if (a === "--response-days") flags["response-days"] = argv[++i];
    else if (a === "--interviews") flags.interviews = argv[++i];
    else if (a === "--notes") flags.notes = argv[++i];
    else if (a === "--template") flags.template = argv[++i];
    else if (a === "--cover-letter") flags["cover-letter"] = true;
    else if (a === "--channel") flags.channel = argv[++i];
    else if (a === "--from") flags.from = argv[++i];
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

function loadOutcomes(): ApplicationOutcome[] {
  if (!existsSync(OUTCOMES_PATH)) return [];
  try {
    const raw = readFileSync(OUTCOMES_PATH, "utf-8");
    return JSON.parse(raw) as ApplicationOutcome[];
  } catch {
    return [];
  }
}

function saveOutcomes(outcomes: ApplicationOutcome[]): void {
  mkdirSync(join(OUTCOMES_PATH, ".."), { recursive: true });
  writeFileSync(OUTCOMES_PATH, JSON.stringify(outcomes, null, 2) + "\n");
}

// ─── Commands ─────────────────────────────────────────────────────────────

function cmdSet(appId: string, flags: Flags): number {
  if (!flags.status) {
    process.stderr.write(
      JSON.stringify({ error: "--status is required", code: "NO_STATUS" }) + "\n",
    );
    return 1;
  }

  const validStatuses = [
    "applied",
    "interviewing",
    "offered",
    "rejected",
    "withdrawn",
    "no_response",
  ];
  if (!validStatuses.includes(flags.status)) {
    process.stderr.write(
      JSON.stringify({
        error: `Invalid status: ${flags.status}. Must be one of: ${validStatuses.join(", ")}`,
        code: "BAD_STATUS",
      }) + "\n",
    );
    return 1;
  }

  const tracker = getTracker();
  let tracked;
  try {
    tracked = tracker.get(appId);
  } finally {
    closeTracker();
  }
  if (!tracked) {
    process.stderr.write(
      JSON.stringify({ error: `Application not found in tracker: ${appId}`, code: "NOT_FOUND" }) + "\n",
    );
    return 1;
  }

  const outcome: ApplicationOutcome = {
    applicationId: appId,
    company: tracked.company,
    role: tracked.role,
    sector: tracked.sector,
    channel: flags.channel ?? tracked.channel ?? "unknown",
    status: flags.status as ApplicationStatus,
    date: new Date().toISOString().slice(0, 10),
    templateUsed: flags.template ?? tracked.template_used,
    coverLetterUsed: flags["cover-letter"] ?? Boolean(tracked.cover_letter_file),
    responseTimeDays: flags["response-days"]
      ? parseInt(flags["response-days"])
      : undefined,
    interviewCount: flags.interviews ? parseInt(flags.interviews) : undefined,
    rejectionReason: flags.reason,
    notes: flags.notes,
  };

  // Validate
  const parsed = ApplicationOutcome.safeParse(outcome);
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

  // Load existing and check for duplicates
  const outcomes = loadOutcomes();
  const existingIdx = outcomes.findIndex(
    (o) => o.applicationId === appId,
  );

  if (existingIdx >= 0) {
    outcomes[existingIdx] = parsed.data;
  } else {
    outcomes.push(parsed.data);
  }

  saveOutcomes(outcomes);

  // Generate reasoning prompt
  const reasoningPrompt =
    flags.status === "rejected" && flags.reason
      ? `This rejection cited '${flags.reason}'. Is this a skill gap? A sector fit issue? Record a reasoning entry with: bun run scripts/profile/reason.ts log --type skill_gap --finding "${flags.reason}" --confidence low`
      : flags.status === "interviewing"
        ? `Interview at ${appId}! What worked? Record with: bun run scripts/profile/reason.ts log --type general`
        : null;

  process.stdout.write(
    JSON.stringify(
      {
        status: "recorded",
        applicationId: appId,
        outcomeStatus: flags.status,
        reasoningPrompt,
        totalOutcomes: outcomes.length,
      },
      null,
      2,
    ) + "\n",
  );

  return 0;
}

function cmdList(): number {
  const outcomes = loadOutcomes();
  process.stdout.write(JSON.stringify(outcomes, null, 2) + "\n");
  return 0;
}

function cmdBulk(csvPath: string): number {
  let csv: string;
  try {
    csv = readFileSync(csvPath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      JSON.stringify({ error: `Cannot read CSV: ${msg}`, code: "READ_ERROR" }) + "\n",
    );
    return 1;
  }

  const lines = csv.trim().split("\n");
  if (lines.length < 2) {
    process.stderr.write(
      JSON.stringify({ error: "CSV has no data rows", code: "EMPTY_CSV" }) + "\n",
    );
    return 1;
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const outcomes = loadOutcomes();
  let added = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });

    if (!row.id) continue;

    const outcome: ApplicationOutcome = {
      applicationId: row.id,
      company: row.company ?? "",
      role: row.role ?? "",
      sector: row.sector || undefined,
      channel: row.channel ?? "unknown",
      status: (row.status as ApplicationStatus) ?? "applied",
      date: row.date ?? new Date().toISOString().slice(0, 10),
      responseTimeDays: row.response_days ? parseInt(row.response_days) : undefined,
      interviewCount: row.interviews ? parseInt(row.interviews) : undefined,
      rejectionReason: row.reason || undefined,
      notes: row.notes || undefined,
    };

    const parsed = ApplicationOutcome.safeParse(outcome);
    if (parsed.success) {
      outcomes.push(parsed.data);
      added++;
    }
  }

  saveOutcomes(outcomes);

  process.stdout.write(
    JSON.stringify(
      {
        status: "bulk_imported",
        file: csvPath,
        added,
        totalOutcomes: outcomes.length,
      },
      null,
      2,
    ) + "\n",
  );

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
    process.stdout.write(`outcome version ${VERSION}\n`);
    return 0;
  }

  if (flags.list) return cmdList();

  const cmd = flags._[0];
  if (cmd === "set") {
    const appId = flags._[1];
    if (!appId) {
      process.stderr.write(
        JSON.stringify({ error: "set requires <app-id>", code: "NO_APP_ID" }) + "\n",
      );
      return 1;
    }
    return cmdSet(appId, flags);
  }

  if (cmd === "bulk") {
    if (!flags.from) {
      process.stderr.write(
        JSON.stringify({ error: "bulk requires --from <csv-path>", code: "NO_CSV" }) + "\n",
      );
      return 1;
    }
    return cmdBulk(flags.from);
  }

  process.stderr.write(
    JSON.stringify({
      error: `Unknown command: ${cmd ?? "(none)"}. Use set, bulk, or list.`,
      code: "BAD_CMD",
    }) + "\n",
  );
  return 1;
}

if (import.meta.main) process.exit(main());
