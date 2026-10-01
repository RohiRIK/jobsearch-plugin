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

const API = "https://remoteok.com/api";
const HELP = `remoteok-cli — search Remote OK (remote/US-heavy) via its public JSON API.

USAGE
  bun run src/cli.ts search -q <text> [--limit N] [--format json]

FLAGS
  --query, -q <text>   Filter positions/tags/company (client-side; API has no search param)
  --limit, -n <n>      Cap results (default 25)
  --format <fmt>       json (default; only format)
  -h, --help           Show this help

OUTPUT
  { meta: { count, source, attribution }, results: [{ title, company, location, url, tags, date }] }
  Exit 0 = success, 1 = error.

Attribution required by the API ToS: results link back to Remote OK and name it as the source.
Personal use only — keep volume low.`;

interface RemoteOkItem {
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  url?: string;
  tags?: string[];
  date?: string;
  description?: string;
}

async function search(query: string, limit: number): Promise<number> {
  const res = await fetchWithRetry(API);
  if (!res.ok) {
    process.stderr.write(JSON.stringify({ error: `Remote OK API ${res.status}`, code: "HTTP" }) + "\n");
    return 1;
  }
  const raw = (await res.json()) as RemoteOkItem[];
  const items = raw.filter((i) => i.position);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matched = items.filter((i) => {
    const hay = `${i.position} ${i.company} ${(i.tags ?? []).join(" ")} ${i.description ?? ""}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const results = matched.slice(0, limit).map((i) => ({
    title: i.position ?? "",
    company: i.company ?? "unknown",
    location: i.location || "Remote",
    url: i.url ?? `https://remoteok.com/remote-jobs/${i.slug}`,
    tags: i.tags ?? [],
    date: i.date,
  }));
  process.stdout.write(
    JSON.stringify(
      { meta: { count: results.length, source: "Remote OK", attribution: "https://remoteok.com" }, results },
      null,
      2
    ) + "\n"
  );
  return 0;
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
    return await search(query, limit);
  } catch (e) {
    process.stderr.write(JSON.stringify({ error: String(e), code: "FETCH" }) + "\n");
    return 1;
  }
}

if (import.meta.main) process.exit(await main());
