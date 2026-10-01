import { SEARCH_URL, htmlFetch, parseJobCards, CATEGORIES, AREAS, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query?: string
  category?: string
  area?: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function resolveId(value: string | undefined, map: Record<string, string>): string | undefined {
  if (!value) return undefined
  if (/^\d+$/.test(value)) return value
  return map[value.toLowerCase()] ?? value
}

function buildUrl(opts: SearchOpts): string {
  const cat = resolveId(opts.category, CATEGORIES)
  if (cat) return `${SEARCH_URL}/cat${cat}/`
  const area = resolveId(opts.area, AREAS)
  if (area) return `${SEARCH_URL}/area/${area}/`
  if (opts.query) return `${SEARCH_URL}/search/${encodeURIComponent(opts.query)}/`
  return `${SEARCH_URL}/cat6/` // default: software
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const date = (c.date || "—").slice(0, 16)
    return `${c.id.padEnd(12)} ${title} ${company} ${loc} ${date}`
  })
  const header = "ID".padEnd(12) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(18) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    if (!html) { writeError("Empty response from Drushim", "EMPTY_RESPONSE"); return 1 }
    let cards = parseJobCards(html)
    if (opts.limit && opts.limit > 0) cards = cards.slice(0, opts.limit)
    if (opts.format === "table") process.stdout.write(renderTable(cards) + "\n")
    else if (opts.format === "plain") process.stdout.write(cards.map((c) => `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`).join("\n\n") + "\n")
    else process.stdout.write(JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) + "\n")
    return 0
  } catch (e) { writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED"); return 1 }
}
