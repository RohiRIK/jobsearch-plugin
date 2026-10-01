import {
  SEARCH_URL,
  htmlFetch,
  parseJobCards,
  REGIONS,
  CATEGORIES,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  position?: string   // category name or ID
  region?: string     // region name or ID
  jobType?: string    // employment type filter
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function resolveParam(value: string | undefined, map: Record<string, string>): string | undefined {
  if (!value) return undefined
  // If it's already a numeric ID, pass through
  if (/^\d+$/.test(value)) return value
  // Otherwise look up by name (case-insensitive)
  return map[value.toLowerCase()] ?? value
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("page", String(opts.page))

  const position = resolveParam(opts.position, CATEGORIES)
  if (position) params.set("position", position)

  const region = resolveParam(opts.region, REGIONS)
  if (region) params.set("region", region)

  if (opts.jobType) params.set("type", opts.jobType)
  if (opts.query) params.set("freetxt", opts.query)

  return `${SEARCH_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const date = (c.date || "—").slice(0, 16)
    return `${c.id.padEnd(11)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(11) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(22) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    if (!html) {
      writeError("Empty response from AllJobs", "EMPTY_RESPONSE")
      return 1
    }
    let cards = parseJobCards(html)
    if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page }, results: cards },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
