#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { MarketSnapshot } from "./market.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";

const MARKET_DIR = join(ROOT, "data", "market");

const HELP = `Career Trajectory (lite) — skill-demand trends across saved market snapshots.

Usage:
  trajectory.ts [--dir <path>] [--top N] [--format json|text]

Snapshots come from: bun run market --save (one per day). Needs at least 2 —
reports honestly when there is not enough history yet.

Output: JSON { snapshots, window: {from, to}, trends: [{ skill, first, last, delta, direction }] }.
Exit 0 on success (including the not-enough-history case), 1 on error.`;

export interface Trend {
  skill: string;
  first: number;
  last: number;
  delta: number;
  direction: "rising" | "falling" | "flat";
}

export function computeTrends(snapshots: MarketSnapshot[], top: number): Trend[] {
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const counts = (s: MarketSnapshot) => new Map(s.topSkills.map((t) => [t.skill, t.count]));
  const firstCounts = counts(first);
  const lastCounts = counts(last);
  const skills = [...new Set([...firstCounts.keys(), ...lastCounts.keys()])];
  return skills
    .map((skill) => {
      const a = firstCounts.get(skill) ?? 0;
      const b = lastCounts.get(skill) ?? 0;
      const delta = b - a;
      return { skill, first: a, last: b, delta, direction: delta > 0 ? "rising" : delta < 0 ? "falling" : "flat" } as Trend;
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.last - a.last)
    .slice(0, top);
}

export async function main(): Promise<number> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      dir: { type: "string" },
      top: { type: "string" },
      format: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  const dir = typeof values.dir === "string" ? resolve(process.cwd(), values.dir) : MARKET_DIR;
  const top = Math.max(1, parseInt((values.top as string) ?? "10", 10) || 10);

  const snapshots: MarketSnapshot[] = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      try {
        snapshots.push(JSON.parse(readFileSync(join(dir, f), "utf-8")) as MarketSnapshot);
      } catch {
        process.stderr.write(JSON.stringify({ warning: `skipping unreadable snapshot ${f}` }) + "\n");
      }
    }
  }

  if (snapshots.length < 2) {
    process.stdout.write(
      JSON.stringify(
        {
          snapshots: snapshots.length,
          trends: [],
          note: `need at least 2 snapshots for a trend — have ${snapshots.length}. Save one per day with: bun run market --save`,
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }

  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const trends = computeTrends(snapshots, top);
  const out = {
    snapshots: snapshots.length,
    window: { from: ordered[0].date, to: ordered[ordered.length - 1].date },
    trends,
  };

  if (values.format === "text") {
    const lines = [`Skill demand ${out.window.from} → ${out.window.to} (${snapshots.length} snapshots)`];
    for (const t of trends) {
      const arrow = t.direction === "rising" ? "↑" : t.direction === "falling" ? "↓" : "→";
      lines.push(`  ${arrow} ${t.skill}: ${t.first} → ${t.last} (${t.delta >= 0 ? "+" : ""}${t.delta})`);
    }
    process.stdout.write(lines.join("\n") + "\n");
  } else {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
