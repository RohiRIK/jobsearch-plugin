#!/usr/bin/env bun
// CLI for searching jobs on Drushim.co.il (Israel job board). Zero deps, Bun-only.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { CATEGORIES, AREAS } from "./helpers.js"

interface Flags { _: string[]; [k: string]: string | boolean | string[] }

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) flags[key] = true
      else { flags[key] = next; i++ }
    } else { (flags._ as string[]).push(a) }
  }
  return flags
}

const VERSION = "1.0.0"
const HELP = `drushim-cli — search jobs on Drushim.co.il (Israel)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]
  bun run src/cli.ts categories
  bun run src/cli.ts areas

SEARCH FLAGS
  --query, -q <text>      Free-text search (Hebrew or English)
  --category <id|name>    Category: software(6), qa(24), hardware(4), etc.
  --area <id|name>        Area: tel aviv(1), haifa(21), jerusalem(18), etc.
  --limit, -n <n>         Cap results (client-side)
  --format <fmt>          json (default) | table | plain

EXAMPLES
  bun run src/cli.ts search --category software --area "tel aviv" --format table
  bun run src/cli.ts search -q "devops" --format table
  bun run src/cli.ts detail 37370210 --format plain

OUTPUT
  JSON to stdout · Errors to stderr as JSON { error, code } · Exit 0=ok, 1=error

Personal use only — reads Drushim's public pages; keep volume low.
`

function parseIntFlag(name: string, raw: string | boolean | string[]): number | null {
  const val = parseInt(raw as string, 10)
  if (isNaN(val)) { process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n"); return null }
  return val
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) { process.stdout.write(HELP); return cmd ? 0 : 1 }

  if (cmd === "categories") {
    const rows = Object.entries(CATEGORIES).map(([n, id]) => `  ${n.padEnd(20)} (id: ${id})`)
    process.stdout.write("Drushim categories:\n" + rows.join("\n") + "\n"); return 0
  }
  if (cmd === "areas") {
    const rows = Object.entries(AREAS).map(([n, id]) => `  ${n.padEnd(20)} (id: ${id})`)
    process.stdout.write("Drushim areas:\n" + rows.join("\n") + "\n"); return 0
  }

  if (cmd === "search") {
    if (flags.limit !== undefined) { const v = parseIntFlag("limit", flags.limit); if (v === null) return 1; flags.limit = String(v) }
    if (flags.page !== undefined) { const v = parseIntFlag("page", flags.page); if (v === null) return 1; flags.page = String(v) }
    const fmt = (flags.format as string) || "json"
    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      category: typeof flags.category === "string" ? flags.category : undefined,
      area: typeof flags.area === "string" ? flags.area : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) { process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n"); return 1 }
    const fmt = (flags.format as string) || "json"
    return runDetail({ id, format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"] })
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n"); return 1
}

main().then((code) => process.exit(code))
