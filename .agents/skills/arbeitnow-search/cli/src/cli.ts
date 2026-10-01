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

const API = "https://www.arbeitnow.com/api/job-board-api";
const MAX_PAGES = 3;
const HELP = `arbeitnow-cli — search Arbeitnow (EU/Germany-heavy job board) via its public API.

USAGE
  bun run src/cli.ts search -q <text> [--limit N] [--format json]

FLAGS
  --query, -q <text>   Filter title/company/tags/description (client-side; API is paginated, no search param)
  --limit, -n <n>      Cap results (default 25)
  --format <fmt>       json (default; only format)
  -h, --help           Show this help

OUTPUT
  { meta: { count, source, attribution }, results: [{ title, company, location, url, remote, tags }] }
  Exit 0 = success, 1 = error. Scans up to ${MAX_PAGES} API pages. Personal use only.`;

interface ArbeitnowJob {
  slug?: string;
  title?: string;
  company_name?: string;
  location?: string;
  url?: string;
  remote?: boolean;
  tags?: string[];
  description?: string;
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
    const results: Array<Record<string, unknown>> = [];
    for (let page = 1; page <= MAX_PAGES && results.length < limit; page++) {
      const res = await fetchWithRetry(`${API}?page=${page}`);
      if (!res.ok) {
        process.stderr.write(JSON.stringify({ error: `Arbeitnow API ${res.status}`, code: "HTTP" }) + "\n");
        return 1;
      }
      const data = (await res.json()) as { data?: ArbeitnowJob[] };
      const jobs = data.data ?? [];
      if (jobs.length === 0) break;
      for (const j of jobs) {
        const hay = `${j.title} ${j.company_name} ${(j.tags ?? []).join(" ")} ${j.description ?? ""}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) continue;
        results.push({
          title: j.title ?? "",
          company: j.company_name ?? "unknown",
          location: j.location || (j.remote ? "Remote (EU)" : "unknown"),
          url: j.url ?? `https://www.arbeitnow.com/jobs/${j.slug}`,
          remote: j.remote ?? false,
          tags: j.tags ?? [],
        });
        if (results.length >= limit) break;
      }
    }
    process.stdout.write(
      JSON.stringify(
        { meta: { count: results.length, source: "Arbeitnow", attribution: "https://www.arbeitnow.com" }, results },
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
