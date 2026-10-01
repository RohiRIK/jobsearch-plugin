#!/usr/bin/env bun
/**
 * ATS Text-Layer Verification CLI
 *
 * Usage:
 *   bun run scripts/verify-ats.ts cv/main_<company>.pdf
 *   bun run scripts/verify-ats.ts --all
 */

import { parseArgs } from "util";
import { existsSync, readFileSync } from "fs";
import { resolve, join, basename as pathBasename } from "path";
import { augmentedPath, resolveBin } from "../src/resolve-bin.js";
import { walkDocuments } from "../src/naming.js";
import { WORKSPACE as ROOT } from "../src/paths.js";


// ─── PDF Text Extraction ────────────────────────────────────────────────────

export async function extractText(pdfPath: string): Promise<string | null> {
  const pdftotext = resolveBin("pdftotext");
  if (!pdftotext) return null;
  try {
    const proc = Bun.spawn([pdftotext, "-layout", "--", pdfPath, "-"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: augmentedPath() },
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    return await new Response(proc.stdout).text();
  } catch {
    return null;
  }
}

// ─── PDF Page Count ─────────────────────────────────────────────────────────

export function getPageCount(pdfPath: string): number | null {
  if (!existsSync(pdfPath)) return null;
  // pdfinfo is authoritative when installed; the raw scan below miscounts on
  // some PDF producers and a utf-8 read can mangle the binary stream.
  const pdfinfo = resolveBin("pdfinfo");
  if (pdfinfo) {
    try {
      const proc = Bun.spawnSync([pdfinfo, "--", pdfPath], { env: { ...process.env, PATH: augmentedPath() } });
      if (proc.exitCode === 0) {
        const m = proc.stdout.toString().match(/^Pages:\s+(\d+)/m);
        if (m) return parseInt(m[1], 10);
      }
    } catch {
      /* fall through to raw scan */
    }
  }
  try {
    const content = readFileSync(pdfPath, "latin1");
    const matches = content.match(/\/Type\s*\/Page(?!\s*s)/g);
    return matches ? matches.length : null;
  } catch {
    return null;
  }
}

// ─── ATS Checks ─────────────────────────────────────────────────────────────

export interface AtsCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export function checkAtsQuality(text: string, isCv: boolean): AtsCheck[] {
  const checks: AtsCheck[] = [];

  // 1. No (cid:*) markers
  const cidMatches = text.match(/\(cid:\d+\)/g);
  checks.push({
    name: "No (cid:*) markers",
    pass: !cidMatches || cidMatches.length === 0,
    detail: cidMatches ? `Found ${cidMatches.length} markers` : undefined,
  });

  // 2. No replacement characters
  const replacementCount = (text.match(/�/g) || []).length;
  checks.push({
    name: "No replacement characters",
    pass: replacementCount === 0,
    detail: replacementCount > 0 ? `Found ${replacementCount} characters` : undefined,
  });

  // 3. Email as literal text
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  checks.push({
    name: "Email in text layer",
    pass: emailRegex.test(text),
    detail: !emailRegex.test(text) ? "No email found — may be icon-only" : undefined,
  });

  // 4. Phone number present (for CVs)
  if (isCv) {
    const phoneRegex = /[\+]?[\d\s\-\(\)]{8,}/;
    checks.push({
      name: "Phone in text layer",
      pass: phoneRegex.test(text),
      detail: !phoneRegex.test(text) ? "No phone number found" : undefined,
    });
  }

  // 5. Usable line structure. Reading order cannot be proven mechanically
  // without layout geometry, so this check deliberately makes the narrower
  // claim that extraction produced normal, bounded lines.
  const lines = text.split("\n").filter((l) => l.trim());
  const malformedLines = lines.filter((line) => line.length > 1_000).length;
  checks.push({
    name: "Usable line structure",
    pass: lines.length >= 3 && malformedLines === 0,
    detail: lines.length < 3 ? `Only ${lines.length} non-empty lines extracted` : malformedLines > 0 ? `${malformedLines} implausibly long lines` : undefined,
  });

  // For CVs, verify the relative order of section headings that actually
  // survived extraction. This catches common multi-column interleaving while
  // avoiding a false "reading order passed" claim when headings are absent.
  if (isCv) {
    const normalized = text.toLowerCase();
    const found = CV_HEADINGS.map((heading) => ({ heading, position: normalized.indexOf(heading) }))
      .filter((item) => item.position >= 0)
      .sort((a, b) => a.position - b.position)
      .map((item) => item.heading);
    if (found.length >= 2) {
      const ordered = CANONICAL_SECTION_ORDERS.some((canonical) => isSubsequence(found, canonical));
      checks.push({
        name: "CV section order",
        pass: ordered,
        detail: ordered ? undefined : `Extracted order: ${found.join(" -> ")}`,
      });
    }
  }

  // 6. Sufficient content length
  const contentLength = text.replace(/\s+/g, "").length;
  checks.push({
    name: "Sufficient content",
    pass: contentLength > 100,
    detail: contentLength <= 100 ? `Only ${contentLength} chars extracted` : undefined,
  });

  return checks;
}

// The extracted heading sequence must match a CV order somebody would actually
// choose. Both of these are legitimate: German-speaking markets place education
// before work experience (src/market-profiles.ts), most others lead with
// experience. Asserting one fixed order failed correct German CVs.
//
// The check exists to catch multi-column interleaving, where extraction returns
// headings in a sequence nobody wrote. Such a jumble is a subsequence of neither
// order, so accepting both keeps the detection and drops the false positive.
const CANONICAL_SECTION_ORDERS = [
  ["profile", "skills", "experience", "projects", "education", "certifications"],
  ["profile", "skills", "education", "certifications", "experience", "projects"],
] as const;

const CV_HEADINGS = ["profile", "skills", "experience", "projects", "education", "certifications"];

function isSubsequence(found: string[], canonical: readonly string[]): boolean {
  let index = 0;
  for (const heading of found) {
    index = canonical.indexOf(heading, index);
    if (index < 0) return false;
    index += 1;
  }
  return true;
}

// ─── Single File Verify ─────────────────────────────────────────────────────

interface VerifyResult {
  file: string;
  pages: number | null;
  checks: AtsCheck[];
  status: "pass" | "fail" | "unavailable";
}

async function verifyFile(pdfPath: string): Promise<VerifyResult> {
  const isCv = pdfPath.includes("cv/") || pathBasename(pdfPath).startsWith("main_") || /_CV\.pdf$/i.test(pdfPath);
  const pages = getPageCount(pdfPath);
  const text = await extractText(pdfPath);

  if (text === null) {
    return {
      file: pdfPath,
      pages,
      checks: [{ name: "Text extraction", pass: false, detail: "pdftotext not installed" }],
      status: "unavailable",
    };
  }

  const checks = checkAtsQuality(text, isCv);
  const status = checks.every((c) => c.pass) ? "pass" : "fail";

  return { file: pdfPath, pages, checks, status };
}

// ─── Verify All ─────────────────────────────────────────────────────────────

async function verifyAll(): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];
  const dirs = [join(ROOT, "assets", "applications"), join(ROOT, "assets", "cv"), join(ROOT, "assets", "cover_letters")];

  for (const dir of dirs) {
    for (const pdf of walkDocuments(dir, new Set([".pdf"]))) {
      results.push(await verifyFile(pdf));
    }
  }

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      all: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
ATS Verification CLI

Usage:
  bun run scripts/verify-ats.ts <file.pdf>    Verify a single PDF
  bun run scripts/verify-ats.ts --all         Verify all PDFs under assets/applications and legacy document folders
    `);
    return;
  }

  let results: VerifyResult[];

  if (values.all) {
    results = await verifyAll();
  } else {
    const input = positionals[0];
    if (!input) {
      console.error("Usage: verify-ats.ts <file.pdf> or --all");
      process.exit(1);
    }
    const pdfPath = resolve(process.cwd(), input);
    if (!existsSync(pdfPath)) {
      console.error(`File not found: ${pdfPath}`);
      process.exit(1);
    }
    results = [await verifyFile(pdfPath)];
  }

  // Print report
  console.log("\nATS Verification Report\n");

  let allPass = true;
  for (const result of results) {
    const name = pathBasename(result.file);
    const icon = result.status === "pass" ? "✓" : result.status === "fail" ? "✗" : "○";
    console.log(`${icon} ${name} — ${result.pages ?? "?"} pages — ${result.status}`);

    for (const check of result.checks) {
      if (!check.pass) {
        allPass = false;
        console.log(`  ✗ ${check.name}: ${check.detail}`);
      }
    }
  }

  console.log("");
  if (allPass) {
    console.log("All checks passed.");
  } else {
    console.log("Some checks failed.");
    process.exit(1);
  }
}

if (import.meta.main) main();
