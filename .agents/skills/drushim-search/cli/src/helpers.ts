// Data source: Drushim.co.il public pages. No authentication required.

export const BASE_URL = "https://www.drushim.co.il"
export const SEARCH_URL = `${BASE_URL}/jobs`
export const DETAIL_URL = `${BASE_URL}/job`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7" },
      redirect: "follow",
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 8000); continue
    }
    if (response.status === 404) return ""
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string; title: string; company: string | null; companyUrl: string | null
  location: string | null; experience: string | null; jobType: string | null
  date: string | null; url: string
}

export interface JobDetail extends JobCard { description: string | null; applyUrl: string | null }

function numericEntity(cp: number): string { return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "" }

function decodeHtmlEntities(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string { return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }
function clean(html: string): string { return decodeHtmlEntities(stripTags(html)) }

/**
 * Parse job cards from Drushim search/category results.
 * Real HTML structure per card:
 *   <div data-cy="job-item{N}" class="flex job job-item">
 *     <div listingid="{LISTING_ID}" class="job-item-main">
 *       <h3><span class="job-url ...">{TITLE}</span></h3>
 *       <p><a href="/דרושים-{ID}-{SLUG}/"><span class="font-weight-medium bidi">{COMPANY}</span></a></p>
 *       <div><span class="display-18"><span>{LOCATION}<span>|</span></span></span></div>
 *       <div><span class="display-18">{EXPERIENCE}</span><span>|</span></div>
 *       <div><span class="region-item"><span>{TYPE}</span></span></div>
 *       <div><span class="inline-flex">לפני {TIME}</span></div>
 *     </div>
 *   </div>
 * Job link: /job/{numeric_id}/{hex_hash}/
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  // Split on job card containers
  const chunks = html.split(/(?=data-cy="job-item)/i).slice(1)

  for (const chunk of chunks) {
    // Extract job ID from /job/{id}/{hash}/
    const idMatch = chunk.match(/\/job\/(\d+)\/[a-f0-9]+\//i)
    if (!idMatch) continue
    const id = idMatch[1]

    // Title — from span.job-url
    let title: string | null = null
    const titleMatch = chunk.match(/class="[^"]*job-url[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
    if (titleMatch) title = clean(titleMatch[1])
    if (!title) continue

    // Company — from span.font-weight-medium.bidi inside a company link
    let company: string | null = null
    let companyUrl: string | null = null
    const compLink = chunk.match(/href="[^"]*\/דרושים-[^"]*\/"[^>]*>[\s\S]*?<span[^>]*class="[^"]*font-weight-medium[^"]*bidi[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
    if (compLink) {
      company = clean(compLink[1])
      const urlMatch = chunk.match(/href="([^"]*\/דרושים-[^"]*\/)"/i)
      if (urlMatch) companyUrl = urlMatch[1].startsWith("http") ? urlMatch[1] : `${BASE_URL}${urlMatch[1]}`
    }

    // Location — first display-18 span before the | divider (Vue adds data-v-* attrs)
    let location: string | null = null
    const locBlock = chunk.match(/<span class="display-18"[^>]*>\s*<span[^>]*>\s*([\s\S]*?)\s*<span[^>]*>\|/i)
    if (locBlock) location = clean(locBlock[1]) || null

    // Experience — display-18 span containing年限 pattern (between | dividers)
    let experience: string | null = null
    const allDisplay18 = [...chunk.matchAll(/<span class="display-18"[^>]*>\s*([\s\S]*?)\s*<\/span>/gi)]
    for (const m of allDisplay18) {
      const val = clean(m[1])
      if (/\d+-\d+\s*שנים|ללא ניסיון|שנה ומעלה/i.test(val)) { experience = val; break }
    }

    // Job type — from region-item span
    let jobType: string | null = null
    const typeMatch = chunk.match(/class="[^"]*region-item[^"]*"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i)
    if (typeMatch) jobType = clean(typeMatch[1]) || null

    // Date — text after clock icon
    let date: string | null = null
    const dateMatch = chunk.match(/לפני\s+([\s\S]*?)<\/span>\s*<\/div>/i)
    if (dateMatch) date = `לפני ${clean(dateMatch[1])}`

    const url = `${BASE_URL}/job/${id}/`
    results.push({ id, title, company, companyUrl, location, experience, jobType, date, url })
  }
  return results
}

export function parseJobDetail(html: string, id: string): JobDetail {
  let title = "(untitled)"
  const titleMatch = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)
  if (titleMatch) title = clean(titleMatch[1])

  let company: string | null = null, companyUrl: string | null = null
  const compMatch = html.match(/href="[^"]*\/דרושים-[^"]*\/"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)
  if (compMatch) { company = clean(compMatch[1]); companyUrl = `${BASE_URL}/` }

  let location: string | null = null
  const locMatch = html.match(/מיקום\s*:?\s*([\s\S]*?)(?=<|היקף|שנות)/i)
  if (locMatch) location = clean(locMatch[1]) || null

  let jobType: string | null = null
  const typeMatch = html.match(/(משרה מלאה|משרה חלקית|עבודה היברידית|עבודה מהבית)/i)
  if (typeMatch) jobType = typeMatch[1]

  let description: string | null = null
  const descMatch = html.match(/class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  if (descMatch) description = clean(descMatch[1]) || null

  let applyUrl: string | null = null
  const applyMatch = html.match(/href="([^"]*apply[^"]*)"/i)
  if (applyMatch) applyUrl = decodeHtmlEntities(applyMatch[1])

  return { id, title, company, companyUrl, location, experience: null, jobType, date: null, url: `${BASE_URL}/job/${id}/`, description, applyUrl }
}

export const CATEGORIES: Record<string, string> = {
  "software": "6", "qa": "24", "hardware": "4", "hitech": "5",
  "internet": "28", "security": "30", "engineering": "10", "design": "26",
  "finance": "9", "hr": "13", "sales": "17", "marketing": "27",
  "legal": "14", "medical": "16", "education": "7", "management": "2",
  "logistics": "21", "retail": "33", "media": "15", "transport": "29",
  "tourism": "31", "industry": "18", "admin": "1", "customerservice": "11",
}

export const AREAS: Record<string, string> = {
  "tel aviv": "1", "holon": "3", "rishon lezion": "4", "petah tikva": "5",
  "raanana": "11", "herzliya": "12", "netanya": "10", "haifa": "21",
  "beer sheva": "30", "jerusalem": "18", "ashdod": "15", "rehovot": "16",
  "kfar saba": "11", "ramat gan": "1", "givatayim": "1", "modiin": "5",
}
