#!/usr/bin/env bun
// Self-contained CLI for searching jobs on AllJobs.co.il (Israel's largest job board).
// No external CLI framework — runs anywhere `bun` is available with zero install.
//
// Personal use only. Reads AllJobs' public guest search pages; keep volume low.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { REGIONS, CATEGORIES } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const VERSION = "1.0.0"

const HELP = `alljobs-cli — search jobs on AllJobs.co.il (Israel's largest job board)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]
  bun run src/cli.ts regions
  bun run src/cli.ts categories

SEARCH FLAGS
  --query, -q <text>      Free-text search (Hebrew or English). e.g. "מפתח Python"
  --position <id|name>    Category filter. Name or numeric ID. e.g. "software", "235"
  --region <id|name>      Region filter. Name or numeric ID. e.g. "tel aviv", "2"
  --jobtype <id>          Employment type: 4=full-time, 5=part-time, 37=hybrid, etc.
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

DETAIL FLAGS
  --format <fmt>          json (default) | plain.

EXAMPLES
  bun run src/cli.ts search -q "data scientist" --region "tel aviv" --format table
  bun run src/cli.ts search --position software --region central --format table
  bun run src/cli.ts search -q "מפתח Python" --region "tel aviv" --format json
  bun run src/cli.ts detail 8547226 --format plain
  bun run src/cli.ts regions
  bun run src/cli.ts categories

REGIONS (usable with --region)
  tel aviv (2), central (2), haifa (1), jerusalem (3),
  beer sheva (7), south (7), north (10), sharon (6), shfela (8)

CATEGORIES (usable with --position)
  software (235), computers (357), internet (320), qa (432),
  python (1694), java (1153), fullstack (1712), frontend (1758),
  backend (1929), cyber (1553), product manager (1156), ux (1373)

OUTPUT
  JSON to stdout (deterministic)
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error

Personal use only — reads AllJobs' public pages; keep volume low.
`

function printRegions(): void {
  const rows = Object.entries(REGIONS).map(
    ([name, id]) => `  ${name.padEnd(16)} (id: ${id})`,
  )
  process.stdout.write("AllJobs regions:\n" + rows.join("\n") + "\n")
}

function printCategories(): void {
  const rows = Object.entries(CATEGORIES).map(
    ([name, id]) => `  ${name.padEnd(20)} (id: ${id})`,
  )
  process.stdout.write("AllJobs categories:\n" + rows.join("\n") + "\n")
}

function parseIntFlag(name: string, raw: string | boolean | string[]): number | null {
  const val = parseInt(raw as string, 10)
  if (isNaN(val)) {
    process.stderr.write(
      JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n",
    )
    return null
  }
  return val
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "regions") {
    printRegions()
    return 0
  }

  if (cmd === "categories") {
    printCategories()
    return 0
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      flags.jobage = String(v)
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      position: typeof flags.position === "string" ? flags.position : undefined,
      region: typeof flags.region === "string" ? flags.region : undefined,
      jobType: typeof flags.jobtype === "string" ? flags.jobtype : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(
    JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n",
  )
  return 1
}

main().then((code) => process.exit(code))
