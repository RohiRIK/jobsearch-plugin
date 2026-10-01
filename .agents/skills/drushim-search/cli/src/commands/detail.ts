import { DETAIL_URL, htmlFetch, parseJobDetail, writeError, type JobDetail } from "../helpers.js"

export interface DetailOpts { id: string; format: "json" | "plain" }

function renderPlain(d: JobDetail): string {
  const lines = [d.title, `Company: ${d.company || "—"}`, `Location: ${d.location || "—"}`, `Type: ${d.jobType || "—"}`, `URL: ${d.url}`]
  if (d.description) lines.push("", d.description)
  if (d.applyUrl) lines.push("", `Apply: ${d.applyUrl}`)
  return lines.join("\n")
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  try {
    const id = opts.id.replace(/.*\/job\//, "").replace(/\/.*$/, "").replace(/[^\d]/g, "")
    if (!id) { writeError("Could not extract a job ID from the input", "BAD_ID"); return 1 }
    const url = `${DETAIL_URL}/${id}/`
    const html = await htmlFetch(url)
    if (!html) { writeError(`Job ${id} not found`, "NOT_FOUND"); return 1 }
    const detail = parseJobDetail(html, id)
    if (opts.format === "plain") process.stdout.write(renderPlain(detail) + "\n")
    else process.stdout.write(JSON.stringify(detail, null, 2) + "\n")
    return 0
  } catch (e) { writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED"); return 1 }
}
