#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SeenJobsFile, SeenJobEntry } from "../../src/schemas.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";

const SEEN_JOBS_PATH = join(ROOT, "data", "seen-jobs.json");

const HELP = `Job Alert Monitor — surface unreviewed scraped jobs, mark them handled.

Usage:
  alerts.ts list [options]                 Pending alerts (status=new)
  alerts.ts mark <url> --status <s>        Set one job's status
  alerts.ts mark-all --status <s>          Set all currently-new jobs' status

Options:
  --since <YYYY-MM-DD>  Only jobs first seen on/after this date (list)
  --fit <list>          Comma-separated fit filter: high,medium,low (list)
  --market <list>       Comma-separated market filter: il,dk,us,eu,remote (list)
  --status <s>          Target status for mark/mark-all: evaluated, skipped, expired
  --input <path>        Seen-jobs file (default: data/seen-jobs.json)
  --format <json|text>  Output format (default: json)
  -h, --help            Show this help

Exit 0/1. New jobs come from: bun run pipeline:scrape.`;

const MARKABLE = ["evaluated", "skipped", "expired"] as const;

function loadFile(path: string): SeenJobsFile | null {
  if (!existsSync(path)) return null;
  try {
    return SeenJobsFile.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return null;
  }
}

export function pendingAlerts(
  file: SeenJobsFile,
  filters: { since?: string; fit?: string[]; market?: string[] } = {}
): Array<SeenJobEntry & { url: string }> {
  return Object.entries(file.seen)
    .map(([url, entry]) => ({ ...entry, url }))
    .filter((e) => e.status === "new")
    .filter((e) => !filters.since || e.first_seen >= filters.since)
    .filter((e) => !filters.fit || filters.fit.includes(e.fit))
    .filter((e) => !filters.market || filters.market.includes(e.market))
    .sort((a, b) => (a.fit === b.fit ? b.first_seen.localeCompare(a.first_seen) : a.fit.localeCompare(b.fit)));
}

export async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      since: { type: "string" },
      fit: { type: "string" },
      market: { type: "string" },
      status: { type: "string" },
      input: { type: "string" },
      format: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
    allowPositionals: true,
  });

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  const inputPath = typeof values.input === "string" ? resolve(process.cwd(), values.input) : SEEN_JOBS_PATH;
  const file = loadFile(inputPath);
  if (!file) {
    process.stderr.write(JSON.stringify({ error: `no valid seen-jobs file at ${inputPath}. Run: bun run pipeline:scrape`, code: "NO_DATA" }) + "\n");
    return 1;
  }

  const command = (positionals[0] as string) ?? "list";

  if (command === "list") {
    const alerts = pendingAlerts(file, {
      since: typeof values.since === "string" ? values.since : undefined,
      fit: typeof values.fit === "string" ? values.fit.split(",") : undefined,
      market: typeof values.market === "string" ? values.market.split(",") : undefined,
    });
    if (values.format === "text") {
      if (alerts.length === 0) {
        process.stdout.write("No pending job alerts.\n");
      } else {
        process.stdout.write(`${alerts.length} pending alerts:\n`);
        for (const a of alerts) {
          process.stdout.write(`  [${a.fit}] ${a.first_seen} ${a.title} — ${a.company} (${a.market}) ${a.url}\n`);
        }
      }
    } else {
      process.stdout.write(JSON.stringify({ pending: alerts.length, alerts }, null, 2) + "\n");
    }
    return 0;
  }

  if (command === "mark" || command === "mark-all") {
    const status = values.status as (typeof MARKABLE)[number];
    if (!MARKABLE.includes(status)) {
      process.stderr.write(JSON.stringify({ error: `--status must be one of: ${MARKABLE.join(", ")}`, code: "BAD_ARGS" }) + "\n");
      return 1;
    }

    let urls: string[];
    if (command === "mark") {
      const url = positionals[1] as string | undefined;
      if (!url) {
        process.stderr.write(JSON.stringify({ error: "mark requires a job url argument", code: "BAD_ARGS" }) + "\n");
        return 1;
      }
      if (!file.seen[url]) {
        process.stderr.write(JSON.stringify({ error: `url not tracked: ${url}`, code: "NOT_FOUND" }) + "\n");
        return 1;
      }
      urls = [url];
    } else {
      urls = Object.entries(file.seen)
        .filter(([, e]) => e.status === "new")
        .map(([url]) => url);
    }

    const updated: SeenJobsFile = {
      seen: Object.fromEntries(
        Object.entries(file.seen).map(([url, entry]) => [url, urls.includes(url) ? { ...entry, status } : entry])
      ),
    };
    writeFileSync(inputPath, JSON.stringify(updated, null, 2) + "\n");
    process.stdout.write(JSON.stringify({ marked: urls.length, status }, null, 2) + "\n");
    return 0;
  }

  process.stderr.write(JSON.stringify({ error: `unknown command: ${command}. Use list, mark, or mark-all.`, code: "BAD_CMD" }) + "\n");
  return 1;
}

if (import.meta.main) {
  process.exit(await main());
}
