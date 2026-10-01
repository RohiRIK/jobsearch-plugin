// Data source: AllJobs.co.il public guest search pages. No authentication required.
// Search returns an HTML list of job cards; detail returns a single job's HTML.
// AllJobs uses Windows-1255 encoding for Hebrew; Bun's fetch handles this transparently.

export const BASE_URL = "https://www.alljobs.co.il"
export const SEARCH_URL = `${BASE_URL}/SearchResultsGuest.aspx`
export const DETAIL_URL = `${BASE_URL}/Search/UploadSingle.aspx`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  jobType: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  requirements: string | null
  applyUrl: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/**
 * Parse job cards from the AllJobs search results page.
 * Each card is in an <li> or <div> containing:
 *   - <a href="/Search/UploadSingle.aspx?JobID=XXXXXXXX"> with the title in an <h2>
 *   - Company link to /Employer/HP/Default.aspx?cid=XXXXX
 *   - Location text after "מיקום המשרה:"
 *   - Job type after "סוג משרה:"
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []

  // Split on job links — each card has a link to UploadSingle.aspx?JobID=XXXXXXXX
  const chunks = html.split(/(?=<a[^>]*href="[^"]*\/Search\/UploadSingle\.aspx\?JobID=\d+)/i).slice(1)

  for (const chunk of chunks) {
    // Extract JobID from the link
    const idMatch = chunk.match(/JobID=(\d+)/i)
    if (!idMatch) continue
    const id = idMatch[1]

    // Extract title — it's in the <h2> inside the job link
    let title: string | null = null
    const h2Match = chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
    if (h2Match) title = clean(h2Match[1])
    if (!title) continue

    // Extract company — link to /Employer/HP/Default.aspx?cid=XXXXX
    let company: string | null = null
    let companyUrl: string | null = null
    const companyMatch = chunk.match(/href="[^"]*\/Employer\/HP\/Default\.aspx\?cid=(\d+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (companyMatch) {
      companyUrl = `${BASE_URL}/Employer/HP/Default.aspx?cid=${companyMatch[1]}`
      company = clean(companyMatch[2]) || null
    }

    // Extract location — appears after "מיקום המשרה:" or in location links
    let location: string | null = null
    const locSection = chunk.match(/מיקום המשרה[\s\S]*?(?=<b>|<strong>|סוג משרה|$)/i)
    if (locSection) {
      // Get city names from links like /SearchResultsGuest.aspx?...&city=XXXX
      const cities: string[] = []
      const cityRe = /city=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
      let cityMatch: RegExpExecArray | null
      while ((cityMatch = cityRe.exec(locSection[0])) !== null) {
        const city = clean(cityMatch[1])
        if (city && !cities.includes(city)) cities.push(city)
      }
      if (cities.length > 0) location = cities.join(", ")
      else {
        // Fallback: text after the label
        const locText = locSection[0].replace(/מיקום המשרה\s*:?\s*/i, "")
        location = clean(locText) || null
      }
    }

    // Extract job type — appears after "סוג משרה:"
    let jobType: string | null = null
    const typeSection = chunk.match(/סוג משרה[\s\S]*?(?=<b>|<strong>|דרישות|location|$)/i)
    if (typeSection) {
      const types: string[] = []
      const typeRe = /type=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
      let typeMatch: RegExpExecArray | null
      while ((typeMatch = typeRe.exec(typeSection[0])) !== null) {
        const t = clean(typeMatch[1])
        if (t && !types.includes(t)) types.push(t)
      }
      if (types.length > 0) jobType = types.join(", ")
    }

    // Extract date — "לפני X שעות" or similar
    let date: string | null = null
    const dateMatch = chunk.match(/לפני\s+(\d+)\s+(שעות|ימים|דקות|שעות)/i)
    if (dateMatch) date = `לפני ${dateMatch[1]} ${dateMatch[2]}`

    // Build URL
    const url = `${BASE_URL}/Search/UploadSingle.aspx?JobID=${id}`

    results.push({ id, title, company, companyUrl, location, jobType, date, url })
  }

  return results
}

/** Parse the single-job detail page. */
export function parseJobDetail(html: string, id: string): JobDetail {
  // Title — <h2> or similar heading
  let title = "(untitled)"
  const titleMatch = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
  if (titleMatch) title = clean(titleMatch[1])

  // Company
  let company: string | null = null
  let companyUrl: string | null = null
  const companyMatch = html.match(/href="[^"]*\/Employer\/HP\/Default\.aspx\?cid=(\d+)"[^>]*>([\s\S]*?)<\/a>/i)
  if (companyMatch) {
    companyUrl = `${BASE_URL}/Employer/HP/Default.aspx?cid=${companyMatch[1]}`
    company = clean(companyMatch[2]) || null
  }

  // Location
  let location: string | null = null
  const locMatch = html.match(/מיקום המשרה\s*:?\s*([\s\S]*?)(?=<b>|<strong>|סוג משרה)/i)
  if (locMatch) location = clean(locMatch[1]) || null

  // Job type
  let jobType: string | null = null
  const typeMatch = html.match(/סוג משרה\s*:?\s*([\s\S]*?)(?=<b>|<strong>|דרישות)/i)
  if (typeMatch) jobType = clean(typeMatch[1]) || null

  // Description — the main content block between requirements sections
  let description: string | null = null
  let requirements: string | null = null

  // Try to split on "דרישות" (requirements)
  const reqSplit = html.split(/דרישות\s*:/i)
  if (reqSplit.length >= 2) {
    description = clean(reqSplit[0].slice(-2000)) || null // last 2000 chars before requirements
    requirements = clean(reqSplit[1].slice(0, 3000)) || null // first 3000 chars after
  } else {
    // No explicit requirements section — grab the main content
    const mainContent = html.match(/class="[^"]*job[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    if (mainContent) description = clean(mainContent[1]) || null
  }

  // Apply URL — the "הגשת מועמדות" button
  let applyUrl: string | null = null
  const applyMatch = html.match(/href="([^"]*apply[^"]*)"/i) ||
    html.match(/href="([^"]*candidat[^"]*)"/i)
  if (applyMatch) applyUrl = decodeHtmlEntities(applyMatch[1])

  const url = `${BASE_URL}/Search/UploadSingle.aspx?JobID=${id}`

  return { id, title, company, companyUrl, location, jobType, date: null, url, description, requirements, applyUrl }
}

/** AllJobs region IDs for common areas. */
export const REGIONS: Record<string, string> = {
  "tel aviv": "2",
  "central": "2",
  "merkaz": "2",
  "haifa": "1",
  "jerusalem": "3",
  "beer sheva": "7",
  "south": "7",
  "north": "10",
  "sharon": "6",
  "shfela": "8",
}

/** AllJobs position (category) IDs for common tech roles. */
export const CATEGORIES: Record<string, string> = {
  "software": "235",
  "computers": "357",
  "internet": "320",
  "qa": "432",
  "devops": "330",
  "data scientist": "1733",
  "data analyst": "1732",
  "bi": "1310",
  "big data": "1671",
  "python": "1694",
  "java": "1153",
  "c++": "1203",
  "fullstack": "1712",
  "frontend": "1758",
  "backend": "1929",
  "cyber": "1553",
  "product manager": "1156",
  "ux": "1373",
  "hr": "661",
  "sales": "493",
  "finance": "576",
}
