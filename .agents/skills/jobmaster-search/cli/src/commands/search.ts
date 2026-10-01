import { SEARCH_URL, htmlFetch, parseJobCards, CATEGORIES, AREAS, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query?: string
  category?: string
  area?: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("q", opts.query)
  const area = opts.area ? (AREAS[opts.area.toLowerCase()] ?? opts.area) : undefined
  if (area) params.set("l", area)
  const cat = opts.category ? (CATEGORIES[opts.category.toLowerCase()] ?? opts.category) : undefined
  if (cat && !opts.query) params.set("q", cat)
  if (opts.page > 1) params.set("p", String(opts.page))
  const qs = params.toString()
  return qs ? `${SEARCH_URL}?${qs}` : SEARCH_URL
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const date = (c.date || "—").slice(0, 12)
    return `${c.id.padEnd(8)} ${title} ${company} ${loc} ${date}`
  })
  const header = "ID".padEnd(8) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(18) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    if (!html) { writeError("Empty response from JobMaster", "EMPTY_RESPONSE"); return 1 }
    let cards = parseJobCards(html)
    if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit)
    if (opts.format === "table") process.stdout.write(renderTable(cards) + "\n")
    else if (opts.format === "plain") process.stdout.write(cards.map((c) => `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`).join("\n\n") + "\n")
    else process.stdout.write(JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) + "\n")
    return 0
  } catch (e) { writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED"); return 1 }
}
