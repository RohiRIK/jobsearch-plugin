#!/usr/bin/env bun
// build-profile.ts — Run the full profile build pipeline.
// Tier 1 CLI: parseFlags, JSON stdout, error JSON to stderr, exit 0/1.
//
// Usage:
//   bun run scripts/profile/build-profile.ts
//   bun run scripts/profile/build-profile.ts --linkedin --cv cv/main_example.tex
//   bun run scripts/profile/build-profile.ts --help

import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { CODE_ROOT } from "../../src/paths.js";

// ─── Configuration ────────────────────────────────────────────────────────

const TOOLS_DIR = join(CODE_ROOT, "scripts", "profile");

// ─── Help ─────────────────────────────────────────────────────────────────

const VERSION = "1.0.0";

const HELP = `build-profile — Run the full profile build pipeline

USAGE
  bun run scripts/profile/build-profile.ts [flags]

FLAGS
  --help, -h          Show this help message
  --version, -v       Show version
  --linkedin          Include LinkedIn scraping (likely blocked, suggests manual)
  --cv <path>         Parse an existing LaTeX CV file
  --skip-github       Skip GitHub fetch
  --skip-blog         Skip blog fetch
  --skip-sync         Skip CLAUDE.md sync

PIPELINE
  1. fetch-github    → data/staging/github.json
  2. fetch-blog      → data/staging/blog.json  (if URL configured)
  3. parse-cv        → data/staging/cv.json    (if --cv provided)
  4. fetch-linkedin  → data/staging/linkedin.json (if --linkedin)
  5. merge           → data/profile.json
  6. sync-claude     → CLAUDE.md updated

OUTPUT
  JSON to stdout (pipeline summary)
  Errors to stderr as JSON { error, code }
  Exit code: 0 = success, 1 = error
`;

// ─── Parse Flags ──────────────────────────────────────────────────────────

interface Flags {
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
  linkedin?: boolean;
  cv?: string;
  "skip-github"?: boolean;
  "skip-blog"?: boolean;
  "skip-sync"?: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-v") flags.version = true;
    else if (a === "--linkedin") flags.linkedin = true;
    else if (a === "--cv") flags.cv = argv[++i];
    else if (a === "--skip-github") flags["skip-github"] = true;
    else if (a === "--skip-blog") flags["skip-blog"] = true;
    else if (a === "--skip-sync") flags["skip-sync"] = true;
  }
  return flags;
}

// ─── Runner ───────────────────────────────────────────────────────────────

interface StepResult {
  step: string;
  status: "ok" | "skip" | "error";
  output?: string;
  error?: string;
}

function runStep(name: string, cmd: string[], skip: boolean): StepResult {
  if (skip) {
    return { step: name, status: "skip" };
  }

  const result = spawnSync("bun", ["run", ...cmd], {
    cwd: CODE_ROOT,
    encoding: "utf-8",
    timeout: 30_000,
  });

  if (result.error) {
    return {
      step: name,
      status: "error",
      error: result.error.message,
    };
  }

  if (result.status !== 0) {
    return {
      step: name,
      status: "error",
      error: result.stderr?.trim() || `Exit code ${result.status}`,
    };
  }

  return {
    step: name,
    status: "ok",
    output: result.stdout?.trim(),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────

export function main(): number {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help || flags.h) {
    process.stdout.write(HELP);
    return 0;
  }

  if (flags.version || flags.v) {
    process.stdout.write(`build-profile version ${VERSION}\n`);
    return 0;
  }

  const results: StepResult[] = [];

  // Step 1: GitHub
  results.push(
    runStep("fetch-github", ["scripts/profile/fetch-github.ts"], flags["skip-github"] ?? false),
  );

  // Step 2: Blog
  results.push(
    runStep("fetch-blog", ["scripts/profile/fetch-blog.ts"], flags["skip-blog"] ?? false),
  );

  // Step 3: CV (optional)
  if (flags.cv) {
    results.push(
      runStep("parse-cv", ["scripts/profile/parse-cv.ts", flags.cv], false),
    );
  }

  // Step 4: LinkedIn (optional)
  if (flags.linkedin) {
    results.push(
      runStep("fetch-linkedin", ["scripts/profile/fetch-linkedin.ts", "--manual"], false),
    );
  }

  // Step 5: Merge
  results.push(runStep("merge", ["scripts/profile/merge.ts"], false));

  // Step 6: Sync CLAUDE.md
  results.push(
    runStep("sync-claude", ["scripts/profile/sync-claude.ts"], flags["skip-sync"] ?? false),
  );

  // Summary
  const summary = {
    steps: results,
    success: results.every((r) => r.status !== "error"),
    profile: "data/profile.json",
    claudeMd: "CLAUDE.md",
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

  const hasError = results.some((r) => r.status === "error");
  return hasError ? 1 : 0;
}

if (import.meta.main) process.exit(main());
