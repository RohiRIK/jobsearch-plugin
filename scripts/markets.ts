#!/usr/bin/env bun
/**
 * Market conventions CLI.
 *
 * Answers "what does a CV look like in this country, and why do we think so?"
 * without opening the data file — sources included, because these are
 * conventions that move rather than rules that hold.
 */

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import {
  MARKET_PROFILES,
  conventionsBlock,
  detectMarket,
  getMarketProfile,
  type MarketProfile,
} from "../src/market-profiles.js";
import { readStdin } from "../src/stdin.js";

const HELP = `markets — CV conventions by country.

Usage:
  bun run markets list                     Every market, one line each
  bun run markets show <code>              Full conventions + sources (e.g. de, dk, ch)
  bun run markets detect --job <file|->    Which market a posting targets
  bun run markets table                    Comparison table across all markets

Options:
  --json    Machine-readable output`;

function summarise(m: MarketProfile): string {
  const [lo, hi] = m.pages;
  const pages = lo === hi ? `${lo}p` : `${lo}-${hi}p`;
  return `${m.code.padEnd(8)} ${m.name.padEnd(18)} ${pages.padEnd(6)} photo:${m.photo.padEnd(9)} details:${m.personalDetails.padEnd(8)} ${m.languages[0]}`;
}

export async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: { job: { type: "string" }, json: { type: "boolean" }, help: { type: "boolean", short: "h" } },
    allowPositionals: true,
    strict: false,
  });

  const cmd = positionals[0] ?? "list";
  if (values.help || cmd === "help") {
    console.log(HELP);
    return 0;
  }

  if (cmd === "list") {
    if (values.json) {
      console.log(JSON.stringify(MARKET_PROFILES.map((m) => ({ code: m.code, name: m.name, region: m.region, pages: m.pages, photo: m.photo, personalDetails: m.personalDetails, languages: m.languages })), null, 2));
      return 0;
    }
    console.log(`${MARKET_PROFILES.length} markets:\n`);
    for (const m of MARKET_PROFILES) console.log("  " + summarise(m));
    console.log("\nbun run markets show <code>   for full conventions and sources");
    return 0;
  }

  if (cmd === "table") {
    const rows = MARKET_PROFILES.map((m) => ({
      country: m.name,
      code: m.code,
      pages: m.pages[0] === m.pages[1] ? `${m.pages[0]}` : m.pages.join("-"),
      photo: m.photo,
      personal: m.personalDetails,
      order: m.ordering === "education-first" ? "edu first" : "exp first",
      language: m.languages[0],
    }));
    if (values.json) {
      console.log(JSON.stringify(rows, null, 2));
      return 0;
    }
    console.log("Country            Code  Pages  Photo      Personal  Order      Language");
    console.log("─".repeat(78));
    for (const r of rows) {
      console.log(
        `${r.country.padEnd(18)} ${r.code.padEnd(5)} ${r.pages.padEnd(6)} ${r.photo.padEnd(10)} ${r.personal.padEnd(9)} ${r.order.padEnd(10)} ${r.language}`
      );
    }
    return 0;
  }

  if (cmd === "show") {
    const code = positionals[1];
    if (!code) {
      console.error("show needs a market code, e.g. `bun run markets show de`");
      return 1;
    }
    const m = getMarketProfile(code);
    if (!m) {
      console.error(`unknown market '${code}'. Known: ${MARKET_PROFILES.map((p) => p.code).join(", ")}`);
      return 1;
    }
    if (values.json) {
      console.log(JSON.stringify({ ...m, patterns: m.patterns.map(String) }, null, 2));
      return 0;
    }
    console.log(conventionsBlock(m));
    console.log("\nSources:");
    for (const s of m.sources) console.log(`  - ${s}`);
    return 0;
  }

  if (cmd === "detect") {
    const source = typeof values.job === "string" ? values.job : undefined;
    if (!source) {
      console.error("detect needs --job <file|->");
      return 1;
    }
    const posting = source === "-" ? await readStdin() : readFileSync(source, "utf-8");
    const m = detectMarket(posting);
    if (values.json) {
      console.log(JSON.stringify({ code: m.code, name: m.name, region: m.region, languages: m.languages, pages: m.pages, photo: m.photo, personalDetails: m.personalDetails }, null, 2));
      return 0;
    }
    console.log(`Detected: ${m.name} (${m.code}), region ${m.region}\n`);
    console.log(conventionsBlock(m));
    return 0;
  }

  console.error(`unknown command '${cmd}'\n\n${HELP}`);
  return 1;
}

if (import.meta.main) {
  process.exit(await main());
}
