#!/usr/bin/env bun
import { parseArgs } from "node:util";

const UA = "Mozilla/5.0 (compatible; job-search-workspace/1.0; personal use)";

// Resilient fetch: 15s timeout, one retry on network error or 5xx/429.
async function fetchWithRetry(url: string, extra: RequestInit = {}): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        ...extra,
        headers: { "user-agent": UA, ...(extra.headers ?? {}) },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok || (res.status < 500 && res.status !== 429)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const FEED = "https://weworkremotely.com/remote-jobs.rss";
const HELP = `wwr-cli — search We Work Remotely via its public RSS feed.

USAGE
  bun run src/cli.ts search -q <text> [--limit N] [--format json]

FLAGS
  --query, -q <text>   Filter title/company/description (client-side)
  --limit, -n <n>      Cap results (default 25)
  --format <fmt>       json (default; only format)
  -h, --help           Show this help

OUTPUT
  { meta: { count, source, attribution }, results: [{ title, company, location, url, date }] }
  Exit 0 = success, 1 = error. Personal use only — reads the public RSS feed.`;

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return (m?.[1] ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      query: { type: "string", short: "q" },
      limit: { type: "string", short: "n" },
      format: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
    allowPositionals: true,
  });
  if (values.help || positionals[0] !== "search") {
    process.stdout.write(HELP + "\n");
    return values.help ? 0 : 1;
  }
  const query = typeof values.query === "string" ? values.query : "";
  const limit = Math.max(1, parseInt((values.limit as string) ?? "25", 10) || 25);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  try {
    const res = await fetchWithRetry(FEED);
    if (!res.ok) {
      process.stderr.write(JSON.stringify({ error: `WWR feed ${res.status}`, code: "HTTP" }) + "\n");
      return 1;
    }
    const xml = await res.text();
    const items = xml.split("<item>").slice(1);
    const results: Array<Record<string, unknown>> = [];
    for (const item of items) {
      const rawTitle = tag(item, "title");
      const link = tag(item, "link");
      const region = tag(item, "region");
      const description = tag(item, "description");
      // WWR titles are "Company: Role"
      const sep = rawTitle.indexOf(":");
      const company = sep > 0 ? rawTitle.slice(0, sep).trim() : "unknown";
      const title = sep > 0 ? rawTitle.slice(sep + 1).trim() : rawTitle;
      const hay = `${rawTitle} ${description}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) continue;
      results.push({
        title,
        company,
        location: region || "Remote",
        url: link,
        date: tag(item, "pubDate"),
      });
      if (results.length >= limit) break;
    }
    process.stdout.write(
      JSON.stringify(
        { meta: { count: results.length, source: "We Work Remotely", attribution: "https://weworkremotely.com" }, results },
        null,
        2
      ) + "\n"
    );
    return 0;
  } catch (e) {
    process.stderr.write(JSON.stringify({ error: String(e), code: "FETCH" }) + "\n");
    return 1;
  }
}

if (import.meta.main) process.exit(await main());
