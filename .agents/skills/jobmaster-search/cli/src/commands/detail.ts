import { BASE_URL, htmlFetch, parseJobDetail, writeError, type JobDetail } from "../helpers.js"

export interface DetailOpts { id: string; format: "json" | "plain" }

function renderPlain(d: JobDetail): string {
  const lines = [d.title, `Company: ${d.company || "—"}`, `Location: ${d.location || "—"}`, `Type: ${d.jobType || "—"}`, `URL: ${d.url}`]
  if (d.description) lines.push("", "Description:", d.description)
  if (d.requirements) lines.push("", "Requirements:", d.requirements)
  if (d.applyUrl) lines.push("", `Apply: ${d.applyUrl}`)
  return lines.join("\n")
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  try {
    const id = opts.id.replace(/.*i=/, "").replace(/[^\d]/g, "")
    if (!id) { writeError("Could not extract a job ID", "BAD_ID"); return 1 }
    const html = await htmlFetch(`${BASE_URL}/jobs/checknum.asp?key=${id}`)
    if (!html) { writeError(`Job ${id} not found`, "NOT_FOUND"); return 1 }
    const detail = parseJobDetail(html, id)
    const output = opts.format === "plain" ? renderPlain(detail) : JSON.stringify(detail, null, 2)
    process.stdout.write(output + "\n")
    return 0
  } catch (e) { writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED"); return 1 }
}
