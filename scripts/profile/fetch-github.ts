#!/usr/bin/env bun
// fetch-github.ts — Fetch GitHub profile and repos for a user.
// Tier 1 CLI: parseFlags, JSON stdout, error JSON to stderr, exit 0/1.
//
// Usage:
//   bun run scripts/profile/fetch-github.ts [username]
//   bun run scripts/profile/fetch-github.ts octocat
//   bun run scripts/profile/fetch-github.ts --help

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { WORKSPACE as ROOT } from "../../src/paths.js";

// ─── Types ────────────────────────────────────────────────────────────────

interface GitHubUser {
  name: string | null;
  email: string | null;
  location: string | null;
  blog: string | null;
  bio: string | null;
  html_url: string;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  html_url: string;
  fork: boolean;
}

interface GitHubStaging {
  name: string | null;
  email: string | null;
  location: string | null;
  blog: string | null;
  bio: string | null;
  linkedin: string | null;
  github: string;
  repos: Array<{
    name: string;
    description: string | null;
    language: string | null;
    stars: number;
    url: string;
  }>;
  languages: Record<string, number>;
}

// ─── Configuration ────────────────────────────────────────────────────────

const STAGING_DIR = join(ROOT, "data", "staging");
const CONFIG_PATH = join(ROOT, "data", "config.json");

// ─── Help ─────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";

const HELP = `fetch-github — Fetch GitHub profile and repos for a user

USAGE
  bun run scripts/profile/fetch-github.ts [username] [flags]
  bun run scripts/profile/fetch-github.ts octocat

FLAGS
  --help, -h          Show this help message
  --version, -v       Show version
  --output, -o <path> Custom output path (default: data/staging/github.json)

BEHAVIOR
  Fetches public GitHub data via api.github.com (no auth needed):
  - Profile: name, email, location, blog, bio
  - Repos: name, description, language, stars, url (excludes forks)
  - Languages: aggregate byte counts across repos

  Reads username from args, or falls back to data/config.json githubUsername.

OUTPUT
  JSON to stdout
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error

EXAMPLES
  bun run scripts/profile/fetch-github.ts octocat
  bun run scripts/profile/fetch-github.ts --output custom/path.json octocat
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
      // unknown flag — ignore
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

// ─── Config Loading ───────────────────────────────────────────────────────

function loadGithubUsername(): string | null {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return config.githubUsername ?? null;
  } catch {
    return null;
  }
}

// ─── GitHub API ───────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = { "User-Agent": "profile-fetcher/1.0" };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error(`User not found: ${url}`);
    }
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

async function fetchGitHubProfile(username: string): Promise<GitHubStaging> {
  const safeUsername = encodeURIComponent(username);
  const user = await fetchJson<GitHubUser>(
    `https://api.github.com/users/${safeUsername}`,
  );

  const repos = await fetchJson<GitHubRepo[]>(
    `https://api.github.com/users/${safeUsername}/repos?per_page=100&sort=updated`,
  );

  // Filter out forks, aggregate languages
  const filteredRepos = repos.filter((r) => !r.fork);
  const languages: Record<string, number> = {};

  for (const repo of filteredRepos) {
    if (repo.language) {
      languages[repo.language] = (languages[repo.language] ?? 0) + 1;
    }
  }

  // Try to extract LinkedIn from bio or blog
  let linkedin: string | null = null;
  const bioText = user.bio ?? "";
  const linkedinMatch = bioText.match(
    /linkedin\.com\/in\/[a-zA-Z0-9-]+/,
  );
  if (linkedinMatch) {
    linkedin = `https://www.${linkedinMatch[0]}`;
  }

  return {
    name: user.name,
    email: user.email,
    location: user.location,
    blog: user.blog,
    bio: user.bio,
    linkedin,
    github: user.html_url,
    repos: filteredRepos.map((r) => ({
      name: r.name,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      url: r.html_url,
    })),
    languages,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────

export async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help || flags.h) {
    process.stdout.write(HELP);
    return 0;
  }

  if (flags.version || flags.v) {
    process.stdout.write(`fetch-github version ${VERSION}\n`);
    return 0;
  }

  // Resolve username: arg > config
  let username: string | undefined = flags._[0];
  if (!username) {
    username = loadGithubUsername() ?? undefined;
  }

  if (!username) {
    process.stderr.write(
      JSON.stringify({
        error: "No username provided. Pass as argument or set githubUsername in data/config.json",
        code: "NO_USERNAME",
      }) + "\n",
    );
    return 1;
  }

  // Fetch
  let data: GitHubStaging;
  try {
    data = await fetchGitHubProfile(username);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      JSON.stringify({ error: msg, code: "FETCH_FAILED" }) + "\n",
    );
    return 1;
  }

  // Write staging file
  const outPath = flags.output ?? join(STAGING_DIR, "github.json");
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n");

  // Summary to stdout
  const summary = {
    source: "github",
    username,
    name: data.name,
    repos: data.repos.length,
    languages: Object.keys(data.languages).length,
    output: outPath,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

  return 0;
}

if (import.meta.main) main().then((code) => process.exit(code));
