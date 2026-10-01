#!/usr/bin/env bun
/**
 * Personal-data scanner.
 *
 * This repo's whole purpose is handling one person's CV, so personal data is
 * always one careless `git add -A` away from being committed. Two files
 * carrying a real email, phone and LinkedIn URL reached the history that way
 * (e510df0) and needed a rewrite to remove.
 *
 * The repo is currently private, which lowers the stakes but does not remove
 * them: visibility can be flipped in two clicks, forks and clones outlive it,
 * and CI logs are readable by anyone with repo access.
 *
 * The scanner BLOCKS rather than sanitises: silently rewriting someone's commit
 * is worse than refusing it, because a rewrite that happens behind your back is
 * a rewrite nobody reviews.
 *
 * Usage:
 *   bun run scan-personal-data                 Scan tracked files (default)
 *   bun run scan-personal-data --staged        Scan staged content (pre-commit)
 *   bun run scan-personal-data --history       Scan every blob in all history
 *   bun run scan-personal-data --json          Machine-readable output
 *
 * Exit 0 when clean, 1 on any finding.
 */

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { CODE_ROOT } from "../src/paths.js";


export interface Pattern {
  name: string;
  /** Must be constructed per-use: a global regex carries lastIndex state. */
  regex: () => RegExp;
  hint: string;
}

/**
 * Patterns are shapes, not a list of one person's details — hardcoding the very
 * strings we are trying to keep out of the repo would defeat the point. The
 * placeholder domains that fixtures and templates legitimately use are allowed
 * by ALLOWED below.
 */
export const PATTERNS: Pattern[] = [
  {
    name: "email address",
    regex: () => /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    hint: "use an example.com address in fixtures; real contact details belong in data/profile.json (gitignored)",
  },
  {
    name: "international phone number",
    regex: () => /\+\d{1,3}[-\s]?\d{1,3}[-\s]?\d{3}[-\s]?\d{4}/g,
    hint: "use a 555 number in fixtures",
  },
  {
    name: "LinkedIn profile URL",
    regex: () => /linkedin\.com\/in\/[A-Za-z0-9-]{6,}/g,
    hint: "reference the profile generically, or keep it in data/profile.json",
  },
];

/**
 * Placeholder / documentation values that must not trip the scanner. Anything
 * here is either an RFC-reserved example domain or an obviously-fake number.
 */
export const ALLOWED = [
  /@example\.(com|org|net)/i,
  // A made-up must-fail address committed once in tests/publish-snapshot.test.ts history.
  /someone@realcompany\.io/i,
  // Published contacts in the bundled fonts' SIL OFL licence files.
  /team@latofonts\.com/i,
  /impallari@gmail\.com/i,
  /@(mail\.)?example\.co\.uk/i,
  // North American 555-01XX is reserved for fiction; 555 generally is the
  // convention for a fake exchange, with or without an area code.
  /555[-\s]?\d{4}/,
  /\+?1[-\s]?555[-\s]?\d{3}[-\s]?\d{4}/,
  // Sequential digits are nobody's phone number (e.g. the +45 12345678 in the
  // jobnet API docs, next to "Jane Doe").
  /1234[-\s]?5678/,
  /noreply@github\.com/i,
  /users\.noreply\.github\.com/i,
  /@anthropic\.com/i,
  /your\.email@/i,
  /candidate@/i,
  /linkedin\.com\/in\/(your-profile|username|placeholder)/i,
];

/**
 * Paths whose whole job is to describe these patterns. The test file is here
 * for the same reason as the scanner itself: it must contain strings that the
 * scanner detects, or it cannot test the detecting half at all. Values in it
 * are still nulled (…-000-0000) so nothing real lives there either.
 */
const SKIP_PATHS = [
  /^scripts\/scan-personal-data\.ts$/,
  /^tests\/scan-personal-data\.test\.ts$/,
  /^\.github\/workflows\/personal-data\.yml$/,
];

export interface Finding {
  file: string;
  line: number;
  pattern: string;
  match: string;
  hint: string;
}

export function scanText(text: string, file: string): Finding[] {
  if (SKIP_PATHS.some((p) => p.test(file))) return [];
  const findings: Finding[] = [];
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    for (const pattern of PATTERNS) {
      for (const m of line.matchAll(pattern.regex())) {
        const match = m[0];
        if (ALLOWED.some((a) => a.test(match))) continue;
        findings.push({
          file,
          line: i + 1,
          pattern: pattern.name,
          // Never echo the full value into logs — CI logs are readable by
          // anyone with repo access, and get pasted into issues.
          match: redact(match),
          hint: pattern.hint,
        });
      }
    }
  });
  return findings;
}

/** Show enough to locate the value, never enough to harvest it. */
export function redact(value: string): string {
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(Math.max(3, value.length - 4))}${value.slice(-2)}`;
}

function sh(cmd: string[]): string {
  const proc = Bun.spawnSync(cmd, { cwd: CODE_ROOT });
  if (proc.exitCode !== 0) return "";
  return proc.stdout.toString();
}

function isProbablyText(path: string): boolean {
  return !/\.(pdf|png|jpe?g|gif|ttf|otf|woff2?|ico|zip|db|bundle)$/i.test(path);
}

export function scanTracked(): Finding[] {
  const files = sh(["git", "ls-files"]).split("\n").filter(Boolean).filter(isProbablyText);
  const findings: Finding[] = [];
  for (const file of files) {
    const content = sh(["git", "show", `HEAD:${file}`]);
    if (content) findings.push(...scanText(content, file));
  }
  return findings;
}

export function scanStaged(): Finding[] {
  const files = sh(["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"])
    .split("\n")
    .filter(Boolean)
    .filter(isProbablyText);
  const findings: Finding[] = [];
  for (const file of files) {
    const content = sh(["git", "show", `:${file}`]);
    if (content) findings.push(...scanText(content, file));
  }
  return findings;
}

/**
 * Every blob in every reachable commit. Catches a bad force-push or a merge
 * that reintroduces an old blob — the diff-only scan cannot see either.
 */
export function scanHistory(): Finding[] {
  const listing = sh(["git", "rev-list", "--all", "--objects"]);
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const line of listing.split("\n")) {
    const [sha, ...rest] = line.split(" ");
    const path = rest.join(" ");
    if (!sha || !path || seen.has(sha) || !isProbablyText(path)) continue;
    seen.add(sha);

    const type = sh(["git", "cat-file", "-t", sha]).trim();
    if (type !== "blob") continue;
    const content = sh(["git", "cat-file", "blob", sha]);
    if (content) findings.push(...scanText(content, path));
  }
  return findings;
}

const HELP = `scan-personal-data — refuse to publish personal contact details.

Usage:
  bun run scan-personal-data [--staged | --history] [--json]

Modes:
  (default)   tracked files at HEAD
  --staged    staged content only — the pre-commit hook path
  --history   every blob in every reachable commit

Exit 0 when clean, 1 on any finding. Matches are redacted in output.`;

export async function main(): Promise<number> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      staged: { type: "boolean" },
      history: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const mode = values.history ? "history" : values.staged ? "staged" : "tracked";
  const findings = values.history ? scanHistory() : values.staged ? scanStaged() : scanTracked();

  if (values.json) {
    console.log(JSON.stringify({ mode, findings, pass: findings.length === 0 }, null, 2));
    return findings.length === 0 ? 0 : 1;
  }

  if (findings.length === 0) {
    console.log(`✓ no personal data found (${mode})`);
    return 0;
  }

  console.error(`✗ personal data found (${mode}) — ${findings.length} finding(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.pattern}: ${f.match}`);
    console.error(`    → ${f.hint}\n`);
  }
  console.error("Remove the value, or add a placeholder to ALLOWED");
  console.error("in scripts/scan-personal-data.ts if it is genuinely an example.");
  return 1;
}

if (import.meta.main) {
  process.exit(await main());
}
