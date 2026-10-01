#!/usr/bin/env bun
import { getTracker, closeTracker } from "../src/tracker.js";
import type { JobApplication } from "../src/schemas.js";

const FOLLOWUP_MARKER = /\[followup \d{4}-\d{2}-\d{2}\]/;

export interface PendingFollowup {
  id: string;
  company: string;
  role: string;
  appliedDate: string;
  daysSinceApplied: number;
  channel?: string;
}

export function pendingFollowups(apps: JobApplication[], minDays: number, now = new Date()): PendingFollowup[] {
  return apps
    .filter((a) => a.status === "applied" && !FOLLOWUP_MARKER.test(a.notes ?? ""))
    .map((a) => ({
      id: a.id,
      company: a.company,
      role: a.role,
      appliedDate: a.date,
      daysSinceApplied: Math.floor((now.getTime() - new Date(a.date).getTime()) / 86_400_000),
      channel: a.channel,
    }))
    .filter((p) => p.daysSinceApplied >= minDays)
    .sort((a, b) => b.daysSinceApplied - a.daysSinceApplied);
}

const HELP = `followup — Track application follow-ups

USAGE
  bun run scripts/followup.ts pending [--days N]
  bun run scripts/followup.ts mark <app-id>

COMMANDS
  pending             List applications due for follow-up
  mark <app-id>       Record that a follow-up was sent (stamps notes)

FLAGS
  --help, -h          Show this help message
  --days <N>          Minimum days since applying (default: 7)

BEHAVIOR
  An application is due for follow-up when status is "applied", at least
  --days have passed since the application date, and no follow-up has been
  recorded. "mark" appends "[followup YYYY-MM-DD]" to the notes field —
  no schema change, works with existing tracker data.

OUTPUT
  JSON to stdout
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error
`;

interface Flags {
  _: string[];
  help?: boolean;
  days?: number;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--days") flags.days = parseInt(argv[++i], 10);
    else if (!a.startsWith("-")) flags._.push(a);
  }
  return flags;
}

export function main(): number {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }

  // No subcommand = the common case: show what's due.
  const cmd = flags._[0] ?? "pending";
  const tracker = getTracker();

  try {
    if (cmd === "pending") {
      const minDays = flags.days ?? 7;
      if (Number.isNaN(minDays) || minDays < 0) {
        process.stderr.write(JSON.stringify({ error: "--days must be a non-negative number", code: "BAD_FLAG" }) + "\n");
        return 1;
      }
      const pending = pendingFollowups(tracker.list(), minDays);
      process.stdout.write(JSON.stringify({ pending, minDays }, null, 2) + "\n");
      return 0;
    }

    if (cmd === "mark") {
      const id = flags._[1];
      if (!id) {
        process.stderr.write(JSON.stringify({ error: "Usage: followup mark <app-id>", code: "NO_ID" }) + "\n");
        return 1;
      }
      const app = tracker.get(id);
      if (!app) {
        process.stderr.write(JSON.stringify({ error: `Application not found: ${id}`, code: "NOT_FOUND" }) + "\n");
        return 1;
      }
      const stamp = `[followup ${new Date().toISOString().slice(0, 10)}]`;
      const notes = app.notes ? `${app.notes} ${stamp}` : stamp;
      tracker.update(id, { notes });
      process.stdout.write(JSON.stringify({ marked: id, notes }, null, 2) + "\n");
      return 0;
    }

    process.stderr.write(JSON.stringify({ error: `Unknown command: ${cmd ?? "(none)"}. Use pending or mark.`, code: "BAD_CMD" }) + "\n");
    return 1;
  } finally {
    closeTracker();
  }
}

if (import.meta.main) process.exit(main());
