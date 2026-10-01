#!/usr/bin/env bun
/**
 * Portfolio projects: sync from the blog, inspect, and match against a posting.
 *
 * A blog's project pages (MDX) are the source of truth for what has been
 * built; point `portfolio.blogProjectsDir` in data/config.json at them. Its MDX frontmatter carries title/summary/tag/link but no
 * work-vs-personal flag and no domain tags, which is exactly what deciding
 * "does this project belong on this CV" needs — so `sync` derives those and
 * writes them into data/profile.json, where the drafting pipeline reads them.
 */

import { parseArgs } from "node:util";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { PortfolioProject, Profile } from "../src/profile-schemas.js";
import { containsPhrase, detectJobDomains, selectProjects } from "../src/project-matching.js";
import { WORKSPACE as ROOT } from "../src/paths.js";

const PROFILE_PATH = join(ROOT, "data", "profile.json");
/**
 * Per-user portfolio settings, from `portfolio` in data/config.json:
 *   blogProjectsDir  directory of the blog's project .mdx files (`~/` expands)
 *   workProjects     slugs that were client/employer work — the blog does not
 *                    record it. Anything not listed is treated as personal, the
 *                    safer default: claiming client work that was not is worse.
 *   mergedInto       slug → slug, for pages that describe the same project
 */
interface PortfolioConfig {
  blogProjectsDir?: string;
  workProjects?: string[];
  mergedInto?: Record<string, string>;
}
const PORTFOLIO: PortfolioConfig = (() => {
  const path = join(ROOT, "data", "config.json");
  if (!existsSync(path)) return {};
  try {
    return (JSON.parse(readFileSync(path, "utf-8")).portfolio ?? {}) as PortfolioConfig;
  } catch {
    return {};
  }
})();
const expandHome = (p: string) => (p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const BLOG_PROJECTS = PORTFOLIO.blogProjectsDir ? expandHome(PORTFOLIO.blogProjectsDir) : "";
const WORK_PROJECTS = new Set(PORTFOLIO.workProjects ?? []);
const MERGED_INTO: Record<string, string> = PORTFOLIO.mergedInto ?? {};

/** Phrases in a project's text that imply a domain. Mirrors PROJECT_DOMAINS. */
const DOMAIN_HINTS: Record<string, string[]> = {
  // Deliberately narrow. Looser hints ("ai ", "agent", "prompt") tagged the
  // entire portfolio ml-ai, because the author writes about AI tooling in nearly
  // every project. A domain must be what the project IS, not what it mentions.
  "ml-ai": ["rag", "llm", "langchain", "gemini", "pinecone", "vector store", "embedding", "machine learning", "copilot agent"],
  "endpoint-management": ["intune", "mdm", "device", "endpoint", "autopilot", "jumpcloud", "fleet", "compliance"],
  "identity-access": ["entra", "identity", "sso", "saml", "okta", "zero trust", "conditional access", "azure ad"],
  "cloud-security": ["security", "defender", "soc", "hardening", "purview", "sentinel"],
  "cloud-infrastructure": ["azure", "gcp", "google workspace", "migration", "cloud"],
  "devops-platform": ["docker", "swarm", "traefik", "ci/cd", "container", "monitoring", "prometheus"],
  automation: ["automation", "workflow", "n8n", "sync", "graph api", "script", "cli", "pipeline"],
  "web-fullstack": ["next.js", "react", "typescript", "dashboard", "full-stack", "web"],
  "data-engineering": ["opensearch", "analytics", "postgresql", "search", "reporting"],
  "iot-hardware": ["orange pi", "sensor", "bme680", "iot", "raspberry"],
};

/** Technologies worth recording as stack when they appear in a project's text. */
const STACK_TERMS = [
  "Next.js", "React", "TypeScript", "PostgreSQL", "OpenSearch", "Docker", "Docker Swarm",
  "Traefik", "Prometheus", "Grafana", "Python", "PowerShell", "Rust", "Bash", "n8n",
  "LangChain", "Gemini", "Pinecone", "Intune", "Entra ID", "Microsoft Graph", "Azure",
  "GCP", "Google Workspace", "Sentinel", "Defender", "Purview", "HiBob", "Swift", "SQL",
];

function frontmatter(text: string): Record<string, string> {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^"|"$/g, "").trim();
  }
  return out;
}

/**
 * Infer domains from the curated text only — title, summary and tag.
 *
 * An earlier version also scanned 2000 characters of MDX body and tagged all 19
 * projects "ml-ai", which put an Orange Pi air-quality sensor at the top of an
 * AI Engineer CV. The body is prose about how the work was done; the summary is
 * the claim about what it is.
 *
 * Domains are ranked by how many hints fire, so the strongest signal leads.
 */
function inferDomains(text: string, tag: string): string[] {
  const hay = `${text} ${tag}`.toLowerCase();
  return Object.entries(DOMAIN_HINTS)
    .map(([domain, hints]) => ({ domain, hits: hints.filter((h) => containsPhrase(hay, h)).length }))
    .filter((d) => d.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map((d) => d.domain);
}

function inferStack(text: string): string[] {
  const hay = text.toLowerCase();
  return STACK_TERMS.filter((t) => containsPhrase(hay, t.toLowerCase()));
}

export function readBlogProjects(dir = BLOG_PROJECTS): PortfolioProject[] {
  if (!dir || !existsSync(dir)) return [];
  const projects: PortfolioProject[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".mdx"))) {
    const slug = file.replace(/\.mdx$/, "");
    if (MERGED_INTO[slug]) continue;
    const raw = readFileSync(join(dir, file), "utf-8");
    const fm = frontmatter(raw);
    const summary = fm.summary ?? "";
    // Curated fields only — see inferDomains.
    const searchText = `${fm.title ?? slug} ${summary}`;
    projects.push(
      PortfolioProject.parse({
        slug,
        name: fm.title || slug,
        kind: WORK_PROJECTS.has(slug) ? "work" : "personal",
        summary,
        domains: inferDomains(searchText, fm.tag ?? ""),
        capabilities: inferDomains(searchText, fm.tag ?? ""),
        stack: inferStack(`${searchText} ${raw.slice(0, 3000)}`),
        link: fm.link || undefined,
        disclosure: "unreviewed",
        publishedAt: fm.publishedAt || undefined,
      }),
    );
  }
  return projects.sort((a, b) => a.slug.localeCompare(b.slug));
}

const HELP = `projects — portfolio projects: sync from the blog, inspect, match against a posting.

Usage:
  bun run projects sync [--dry-run]                     Preview blog projects without modifying the profile
  bun run projects sync --replace-from-blog             Replace curated profile projects (explicit destructive action)
  bun run projects list                                 Show what is in the profile
  bun run projects match --job <file>                   Which projects belong on a CV for this posting
  bun run projects approve <slug>                       Allow a project in CV/interview evidence
  bun run projects restrict <slug>                      Keep a project out of CV/interview evidence

Options:
  --json        Machine-readable output
  --limit <n>   Max projects to select (default 4)`;

function loadProfile(): Profile {
  if (!existsSync(PROFILE_PATH)) throw new Error("no data/profile.json — run: bun run profile");
  return Profile.parse(JSON.parse(readFileSync(PROFILE_PATH, "utf-8")));
}

export async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      job: { type: "string" },
      json: { type: "boolean" },
      "dry-run": { type: "boolean" },
      "replace-from-blog": { type: "boolean" },
      limit: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: false,
  });

  const cmd = positionals[0] ?? "list";
  if (values.help || cmd === "help") {
    console.log(HELP);
    return 0;
  }

  if (cmd === "sync") {
    const preview = values["dry-run"] || values.json;
    if (!preview && !values["replace-from-blog"]) {
      console.error("Refusing to overwrite curated profile projects. Preview with `projects sync --dry-run`, then use `projects sync --replace-from-blog` only when intended.");
      return 1;
    }

    const found = readBlogProjects();
    if (found.length === 0) {
      console.error(BLOG_PROJECTS ? `No projects found at ${BLOG_PROJECTS}. Is the blog checked out?` : "Set portfolio.blogProjectsDir in data/config.json to your blog's project pages.");
      return 1;
    }
    const work = found.filter((p) => p.kind === "work").length;
    if (values["dry-run"] || values.json) {
      console.log(JSON.stringify(found, null, 2));
      return 0;
    }
    const profile = loadProfile();
    profile.projects = found;
    writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2) + "\n");
    console.log(`synced ${found.length} projects into data/profile.json (${work} work, ${found.length - work} personal)`);
    console.log(`merged: ${Object.entries(MERGED_INTO).map(([a, b]) => `${a} -> ${b}`).join(", ")}`);
    return 0;
  }

  if (cmd === "list") {
    const projects = loadProfile().projects ?? [];
    if (projects.length === 0) {
      console.error("No projects in the profile. Run: bun run projects sync");
      return 1;
    }
    if (values.json) {
      console.log(JSON.stringify(projects, null, 2));
      return 0;
    }
    for (const p of projects) {
      console.log(`${p.kind === "work" ? "[work]" : "[pers]"} ${p.name}`);
      console.log(`         domains: ${p.domains.join(", ") || "(none)"}`);
    }
    return 0;
  }

  if (cmd === "approve" || cmd === "restrict") {
    const slug = positionals[1];
    if (!slug) {
      console.error(`${cmd} requires an exact project slug`);
      return 1;
    }
    const profile = loadProfile();
    const project = profile.projects?.find((item) => item.slug === slug);
    if (!project) {
      console.error(`Project not found: ${slug}`);
      return 1;
    }
    project.disclosure = cmd === "approve" ? "approved" : "restricted";
    writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2) + "\n");
    console.log(`${slug} is now ${project.disclosure} for application evidence`);
    return 0;
  }

  if (cmd === "match") {
    const jobFile = typeof values.job === "string" ? values.job : undefined;
    if (!jobFile) {
      console.error("match needs --job <file>");
      return 1;
    }
    const posting = readFileSync(jobFile, "utf-8");
    const projects = loadProfile().projects ?? [];
    const limit = values.limit ? Number(values.limit) : undefined;
    const result = selectProjects(projects, posting, limit ? { limit } : {});

    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    console.log(`Posting reads as: ${result.jobDomains.join(", ") || "(no domain detected)"}\n`);
    console.log("ON THE CV:");
    if (result.selected.length === 0) console.log("  (nothing fits — better a short CV than a padded one)");
    for (const m of result.selected) {
      console.log(`  ${String(m.score).padStart(3)}  ${m.project.name}`);
      console.log(`       ${m.reason}`);
    }
    console.log("\nLEFT OFF:");
    for (const m of result.rejected.slice(0, 8)) {
      console.log(`  ${String(m.score).padStart(3)}  ${m.project.name} — ${m.excludedBecause ?? m.reason}`);
    }
    return 0;
  }

  console.error(`unknown command '${cmd}'\n\n${HELP}`);
  return 1;
}

if (import.meta.main) {
  process.exit(await main());
}
