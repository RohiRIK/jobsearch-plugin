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

const API = "https://remotive.com/api/remote-jobs";
const HELP = `remotive-cli — search Remotive remote jobs via its public API.

USAGE
  bun run src/cli.ts search -q <text> [--limit N] [--format json]

FLAGS
  --query, -q <text>   Search term (server-side)
  --limit, -n <n>      Cap results (default 25)
  --format <fmt>       json (default; only format)
  -h, --help           Show this help

OUTPUT
  { meta: { count, source, attribution }, results: [{ title, company, location, url, date }] }
  Exit 0 = success, 1 = error.

API legal notice: jobs may not be re-posted to third-party boards; personal tracking use only, link back to Remotive.`;

interface RemotiveJob {
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  url?: string;
  publication_date?: string;
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
  try {
    const res = await fetch(`${API}?search=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) {
      process.stderr.write(JSON.stringify({ error: `Remotive API ${res.status}`, code: "HTTP" }) + "\n");
      return 1;
    }
    const data = (await res.json()) as { jobs?: RemotiveJob[] };
    const results = (data.jobs ?? []).slice(0, limit).map((j) => ({
      title: j.title ?? "",
      company: j.company_name ?? "unknown",
      location: j.candidate_required_location || "Remote",
      url: j.url ?? "",
      date: j.publication_date,
    }));
    process.stdout.write(
      JSON.stringify(
        { meta: { count: results.length, source: "Remotive", attribution: "https://remotive.com" }, results },
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
