// Data source: JobMaster.co.il public pages. No authentication required.

export const BASE_URL = "https://www.jobmaster.co.il"
export const SEARCH_URL = `${BASE_URL}/jobs/`

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
  id: string; title: string; company: string | null; location: string | null
  date: string | null; jobType: string | null; url: string
}

export interface JobDetail extends JobCard { description: string | null; requirements: string | null; applyUrl: string | null }

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

/** Extract and clean the first capture group from a regex match, or return null. */
function extractField(html: string, regex: RegExp): string | null {
  const m = html.match(regex)
  return m ? clean(m[1]) || null : null
}

/**
 * Parse job cards from JobMaster search results.
 * Real HTML structure per card:
 *   <article id="misra{JOB_ID}" class="CardStyle JobItem">
 *     <a class="CardHeader" href='/jobs/checknum.asp?key={JOB_ID}'>{TITLE}</a>
 *     <span class="Gray">פורסם לפני {TIME}</span>
 *     ע"י <a class="CompanyNameLink" href="checkhevra.asp?cs={CODE}"><span>{COMPANY}</span></a>
 *     <li class="jobLocation"><span>{LOCATION}</span></li>
 *     <li class="jobType">{TYPE}</li>
 *     <div class="jobShortDescription Gray">{DESCRIPTION}</div>
 *   </article>
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/(?=<article[^>]*id="misra)/i).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/id="misra(\d+)"/i)
    if (!idMatch) continue
    const id = idMatch[1]

    const title = extractField(chunk, /class="[^"]*CardHeader[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
    if (!title) continue

    const company =
      extractField(chunk, /class="[^"]*CompanyNameLink[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ??
      extractField(chunk, /class="[^"]*ByTitle[^"]*"[^>]*>([\s\S]*?)<\/span>/i)

    const location = extractField(chunk, /class="[^"]*jobLocation[^"]*"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i)
    const jobType = extractField(chunk, /class="[^"]*jobType[^"]*"[^>]*>([\s\S]*?)<\/li>/i)

    let date: string | null = null
    const dateMatch = chunk.match(/פורסם\s+לפני\s+([\s\S]*?)<\/span>/i)
    if (dateMatch) date = `פורסם לפני ${clean(dateMatch[1])}`

    results.push({ id, title, company, location, date, jobType, url: `${BASE_URL}/jobs/checknum.asp?key=${id}` })
  }
  return results
}

export function parseJobDetail(html: string, id: string): JobDetail {
  const title = extractField(html, /class="CardHeader"[^>]*>([\s\S]*?)<\/div>/i) || "(untitled)"

  const company =
    extractField(html, /class="compMoreInfo"[^>]*>\s*([\s\S]*?)\s*<div class="compSize"/i) ??
    extractField(html, /class="[^"]*CompanyNameLink[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)

  const location = extractField(html, /class="[^"]*jobLocation[^"]*"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i)
  const jobType = extractField(html, /class="[^"]*jobType[^"]*"[^>]*>([\s\S]*?)<\/li>/i)
  const description = extractField(html, /id="jobDescriptionContent"[^>]*>([\s\S]*?)<\/div>/i)
  const requirements = extractField(html, /id="jobRequirementsContent"[^>]*>([\s\S]*?)<\/div>/i)
  const date = extractField(html, /class="[^"]*jobHead__text__addedBefore[^"]*"[^>]*>([\s\S]*?)<\/div>/i)

  const jobUrl = `${BASE_URL}/jobs/checknum.asp?key=${id}`
  const applyUrl = html.match(/applyJob\(\s*\d+\s*,\s*null\s*\)/i) ? jobUrl : null

  return { id, title, company, location, date, jobType, url: jobUrl, description, requirements, applyUrl }
}

export const CATEGORIES: Record<string, string> = {
  "software": "מחשבים ותוכנה", "qa": "QA", "cyber": "אבטחת מידע וסייבר",
  "electronics": "אלקטרוניקה וחומרה", "engineering": "הנדסה",
  "sales": "מכירות", "finance": "חשבונאות וכספים", "hr": "משאבי אנוש",
  "logistics": "לוגיסטיקה ומחסנים", "customerservice": "שירות לקוחות",
  "admin": "מנהלה ומזכירות", "medical": "רפואה ופארמה",
  "marketing": "שיווק", "legal": "חוק ומשפט", "construction": "בנייה/נדל\"ן",
  "industry": "מכונות ותעשיה", "design": "עיצוב", "media": "אומנות בידור ומדיה",
}

export const AREAS: Record<string, string> = {
  "tel aviv": "תל אביב", "central": "מרכז", "north": "צפון",
  "south": "דרום", "jerusalem": "ירושלים", "haifa": "חיפה",
  "sharon": "שרון", "shfela": "שפלה", "beer sheva": "באר שבע",
  "petah tikva": "פתח תקווה", "rishon lezion": "ראשון לציון",
  "herzliya": "הרצליה", "netanya": "נתניה", "holon": "חולון",
}
