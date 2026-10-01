#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SeenJobsFile, SeenJobEntry } from "../../src/schemas.js";
import { SKILL_TERMS } from "./summarize.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";

const SEEN_JOBS_PATH = join(ROOT, "data", "seen-jobs.json");
const MARKET_DIR = join(ROOT, "data", "market");

const HELP = `Job Market Intelligence — demand snapshot from scraped jobs.

Usage:
  market.ts [options]

Options:
  --input <path>        Seen-jobs file (default: data/seen-jobs.json)
  --save                Also write snapshot to data/market/<date>.json
  --format <json|text>  Output format (default: json)
  -h, --help            Show this help

Aggregates: totals, market/fit/status distribution, top skills in titles,
top companies, top locations. Exit 0/1.`;

export interface MarketSnapshot {
  date: string;
  totalJobs: number;
  byMarket: Record<string, number>;
  byFit: Record<string, number>;
  byStatus: Record<string, number>;
  topSkills: Array<{ skill: string; count: number }>;
  topCompanies: Array<{ company: string; count: number }>;
  topLocations: Array<{ location: string; count: number }>;
}

function tally<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    return { ...acc, [k]: (acc[k] ?? 0) + 1 };
  }, {});
}

function top(counts: Record<string, number>, n: number): Array<{ key: string; count: number }> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

export function buildSnapshot(entries: SeenJobEntry[], date: string): MarketSnapshot {
  const titles = entries.map((e) => e.title.toLowerCase());
  const skillCounts: Record<string, number> = {};
  for (const term of SKILL_TERMS) {
    const count = titles.filter((t) => t.includes(term)).length;
    if (count > 0) skillCounts[term] = count;
  }

  return {
    date,
    totalJobs: entries.length,
    byMarket: tally(entries, (e) => e.market),
    byFit: tally(entries, (e) => e.fit),
    byStatus: tally(entries, (e) => e.status),
    topSkills: top(skillCounts, 15).map(({ key, count }) => ({ skill: key, count })),
    topCompanies: top(tally(entries, (e) => e.company), 10).map(({ key, count }) => ({ company: key, count })),
    topLocations: top(tally(entries, (e) => e.location), 10).map(({ key, count }) => ({ location: key, count })),
  };
}

function renderText(s: MarketSnapshot): string {
  const lines: string[] = [];
  lines.push(`Market snapshot ${s.date} — ${s.totalJobs} jobs`);
  lines.push(`Markets: ${Object.entries(s.byMarket).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  lines.push(`Fit: ${Object.entries(s.byFit).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  lines.push(`Status: ${Object.entries(s.byStatus).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  lines.push(`Top skills: ${s.topSkills.map((x) => `${x.skill}(${x.count})`).join(", ") || "none detected"}`);
  lines.push(`Top companies: ${s.topCompanies.slice(0, 5).map((x) => `${x.company}(${x.count})`).join(", ")}`);
  lines.push(`Top locations: ${s.topLocations.slice(0, 5).map((x) => `${x.location}(${x.count})`).join(", ")}`);
  return lines.join("\n");
}

export async function main(): Promise<number> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      input: { type: "string" },
      save: { type: "boolean" },
      format: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  const inputPath = typeof values.input === "string" ? resolve(process.cwd(), values.input) : SEEN_JOBS_PATH;
  if (!existsSync(inputPath)) {
    process.stderr.write(JSON.stringify({ error: `no seen-jobs file at ${inputPath}. Run: bun run pipeline:scrape`, code: "NO_DATA" }) + "\n");
    return 1;
  }

  let entries: SeenJobEntry[];
  try {
    const file = SeenJobsFile.parse(JSON.parse(readFileSync(inputPath, "utf-8")));
    entries = Object.values(file.seen);
  } catch (e) {
    process.stderr.write(JSON.stringify({ error: `invalid seen-jobs file: ${e}`, code: "BAD_DATA" }) + "\n");
    return 1;
  }

  const date = new Date().toISOString().slice(0, 10);
  const snapshot = buildSnapshot(entries, date);

  let saved: string | null = null;
  if (values.save) {
    mkdirSync(MARKET_DIR, { recursive: true });
    const savePath = join(MARKET_DIR, `${date}.json`);
    writeFileSync(savePath, JSON.stringify(snapshot, null, 2) + "\n");
    saved = savePath.replace(ROOT + "/", "");
  }

  if (values.format === "text") {
    process.stdout.write(renderText(snapshot) + (saved ? `\nSaved: ${saved}` : "") + "\n");
  } else {
    process.stdout.write(JSON.stringify({ ...snapshot, saved }, null, 2) + "\n");
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
