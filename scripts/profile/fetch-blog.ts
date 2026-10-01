#!/usr/bin/env bun
// fetch-blog.ts — Fetch blog posts via RSS or HTML scraping.
// Tier 1 CLI: parseFlags, JSON stdout, error JSON to stderr, exit 0/1.
//
// Usage:
//   bun run scripts/profile/fetch-blog.ts <blog-url>
//   bun run scripts/profile/fetch-blog.ts https://example.com
//   bun run scripts/profile/fetch-blog.ts --help

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { WORKSPACE as ROOT } from "../../src/paths.js";

// ─── Types ────────────────────────────────────────────────────────────────

interface BlogPost {
  title: string;
  date: string | null;
  summary: string | null;
  url: string;
}

interface BlogStaging {
  url: string;
  posts: BlogPost[];
}

// ─── Configuration ────────────────────────────────────────────────────────

const STAGING_DIR = join(ROOT, "data", "staging");

const RSS_PATHS = ["/feed", "/rss", "/atom.xml", "/feed.xml", "/rss.xml"];

// ─── Help ─────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";

const HELP = `fetch-blog — Fetch blog posts via RSS or HTML scraping

USAGE
  bun run scripts/profile/fetch-blog.ts <blog-url>
  bun run scripts/profile/fetch-blog.ts https://example.com

FLAGS
  --help, -h          Show this help message
  --version, -v       Show version
  --output, -o <path> Custom output path

BEHAVIOR
  Auto-detects RSS feeds at /feed, /rss, /atom.xml, /feed.xml, /rss.xml.
  RSS: parses <item> or <entry> elements for title, date, summary, link.
  No RSS: extracts articles from <article> or <h2> patterns in HTML.

  Feed parsing is best-effort; partial results are accepted.

OUTPUT
  JSON to stdout
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error

EXAMPLES
  bun run scripts/profile/fetch-blog.ts https://example.com/blog
  bun run scripts/profile/fetch-blog.ts --output custom.json https://blog.example.com
`;

// ─── Parse Flags ──────────────────────────────────────────────────────────

interface Flags {
  _: string[];
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
  output?: string;
  o?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-v") flags.version = true;
    else if (a === "--output" || a === "-o") {
      flags.output = argv[++i];
    } else if (a.startsWith("-")) {
      // unknown flag
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

// ─── RSS Parsing ──────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string | null {
  // Simple regex-based XML extraction — not a full parser, but sufficient
  // for RSS/Atom feeds with standard formatting.
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`),
  );
  if (match) return match[1].trim();

  const plain = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return plain?.[1]?.trim() ?? null;
}

function extractItems(xml: string): string[] {
  // Split by <item> or <entry> (Atom)
  const items = xml.split(/<(?:item|entry)[\s>]/);
  return items.slice(1); // skip preamble
}

function parseRssItem(item: string): BlogPost {
  const title = extractTag(item, "title") ?? "Untitled";
  const pubDate =
    extractTag(item, "pubDate") ??
    extractTag(item, "published") ??
    extractTag(item, "updated");
  const description =
    extractTag(item, "description") ??
    extractTag(item, "summary") ??
    extractTag(item, "content");
  const link = extractTag(item, "link");

  // Extract URL from <link> or <link href="..."/>
  let url = link ?? "";
  if (!url) {
    const hrefMatch = item.match(/<link[^>]+href="([^"]+)"/);
    url = hrefMatch?.[1] ?? "";
  }

  // Clean HTML from description
  const cleanSummary = description
    ?.replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) ?? null;

  // Parse date
  let date: string | null = null;
  if (pubDate) {
    try {
      date = new Date(pubDate).toISOString().slice(0, 10);
    } catch {
      date = pubDate;
    }
  }

  return { title, date, summary: cleanSummary, url };
}

// ─── HTML Scraping ────────────────────────────────────────────────────────

function extractFromHtml(
  html: string,
  baseUrl: string,
): BlogPost[] {
  const posts: BlogPost[] = [];

  // Try <article> tags
  const articleMatches = html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi);
  for (const match of articleMatches) {
    const article = match[1];
    const titleMatch = article.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
    const title = titleMatch?.[1]?.replace(/<[^>]+>/g, "").trim();
    if (!title) continue;

    const linkMatch = article.match(/href="([^"]+)"/i);
    const url = linkMatch?.[1]
      ? new URL(linkMatch[1], baseUrl).href
      : baseUrl;

    const dateMatch = article.match(
      /datetime="([^"]+)"|<time[^>]*>([^<]+)/i,
    );
    const dateStr = dateMatch?.[1] ?? dateMatch?.[2] ?? null;
    let date: string | null = null;
    if (dateStr) {
      try {
        date = new Date(dateStr).toISOString().slice(0, 10);
      } catch {
        date = dateStr;
      }
    }

    const summaryMatch = article.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const summary = summaryMatch?.[1]
      ?.replace(/<[^>]+>/g, "")
      .trim()
      .slice(0, 500) ?? null;

    posts.push({ title, date, summary, url });
  }

  // Fallback: try <h2> with adjacent <a>
  if (posts.length === 0) {
    const h2Matches = html.matchAll(
      /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/gi,
    );
    for (const match of h2Matches) {
      const url = new URL(match[1], baseUrl).href;
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      if (title) {
        posts.push({ title, date: null, summary: null, url });
      }
    }
  }

  return posts;
}

// ─── Staging Write Helper ─────────────────────────────────────────────────

function writeStaging(
  blogUrl: string,
  posts: BlogPost[],
  outPath: string,
  source: string,
  extra: Record<string, unknown> = {},
): void {
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ url: blogUrl, posts }, null, 2) + "\n");
  process.stdout.write(
    JSON.stringify({ source, url: blogUrl, posts: posts.length, output: outPath, ...extra }, null, 2) + "\n",
  );
}

// ─── Feed Detection ───────────────────────────────────────────────────────

async function detectRss(baseUrl: string): Promise<string | null> {
  for (const path of RSS_PATHS) {
    const url = new URL(path, baseUrl).href;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "profile-fetcher/1.0" },
        redirect: "follow",
      });
      if (resp.ok) {
        const text = await resp.text();
        if (
          text.includes("<rss") ||
          text.includes("<feed") ||
          text.includes("<channel")
        ) {
          return url;
        }
      }
    } catch {
      // try next path
    }
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────

export async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help || flags.h) {
    process.stdout.write(HELP);
    return 0;
  }

  if (flags.version || flags.v) {
    process.stdout.write(`fetch-blog version ${VERSION}\n`);
    return 0;
  }

  const blogUrl = flags._[0];
  if (!blogUrl) {
    process.stderr.write(
      JSON.stringify({
        error: "Provide a blog URL as argument",
        code: "NO_URL",
      }) + "\n",
    );
    return 1;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(blogUrl);
  } catch {
    process.stderr.write(
      JSON.stringify({ error: "Invalid URL", code: "INVALID_URL" }) + "\n",
    );
    return 1;
  }

  const baseUrl = parsedUrl.origin;

  // Step 1: Try RSS
  const rssUrl = await detectRss(baseUrl);
  if (rssUrl) {
    try {
      const resp = await fetch(rssUrl, {
        headers: { "User-Agent": "profile-fetcher/1.0" },
      });
      const xml = await resp.text();
      const items = extractItems(xml);
      const posts = items.map(parseRssItem).filter((p) => p.title !== "Untitled");
      const outPath = flags.output ?? join(STAGING_DIR, "blog.json");
      writeStaging(blogUrl, posts, outPath, "blog-rss", { rssUrl });
      return 0;
    } catch {
      // RSS fetch failed, fall through to HTML
    }
  }

  // Step 2: HTML scraping
  try {
    const resp = await fetch(blogUrl, {
      headers: { "User-Agent": "profile-fetcher/1.0" },
      redirect: "follow",
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const posts = extractFromHtml(html, baseUrl);
    const outPath = flags.output ?? join(STAGING_DIR, "blog.json");
    writeStaging(blogUrl, posts, outPath, "blog-html");
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      JSON.stringify({ error: msg, code: "FETCH_FAILED" }) + "\n",
    );
    return 1;
  }
}

if (import.meta.main) main().then((code) => process.exit(code));
