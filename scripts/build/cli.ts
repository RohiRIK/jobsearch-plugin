#!/usr/bin/env bun
/**
 * Document Build CLI
 *
 * Unified entry point for document generation. Detects input format,
 * picks the right engine (Typst primary, LaTeX fallback), validates output.
 *
 * Usage:
 *   bun run scripts/build/cli.ts build <file.typ|tex>    Build single file
 *   bun run scripts/build/cli.ts build --all              Build everything
 *   bun run scripts/build/cli.ts verify                   Verify existing PDFs
 *   bun run scripts/build/cli.ts pipeline <company> <role> Run 5-step pipeline
 *   bun run scripts/build/cli.ts config                   Show current config
 */

import { parseArgs } from "node:util";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, basename, dirname, extname, join } from "path";
import { CompileResult, CompileEngine } from "../../src/schemas.js";
import { buildOutputPath, buildSourcePath } from "../../src/naming.js";
import { augmentedPath, resolveBin, resolveTypstCommand } from "../../src/resolve-bin.js";
import { loadBuildConfig, BuildConfig } from "./config.js";
import { CODE_ROOT, typstRoot } from "../../src/paths.js";

const CLI_NAME = "build";
const VERSION = "1.0.0";

// ─── Engine Detection ───────────────────────────────────────────────────────

function detectEngine(filePath: string): CompileEngine {
  const ext = extname(filePath);
  if (ext === ".typ") return "typst";

  if (ext === ".tex") {
    const content = readFileSync(filePath, "utf-8");
    if (content.includes("\\documentclass") && content.includes("moderncv")) {
      return "lualatex";
    }
    return "xelatex";
  }

  throw new Error(`Unsupported file extension: ${ext}`);
}

// ─── Compilation ────────────────────────────────────────────────────────────

export async function compile(
  inputPath: string,
  outputPath?: string
): Promise<CompileResult> {
  const engine = detectEngine(inputPath);
  const start = performance.now();

  const inputDir = dirname(inputPath);
  const inputName = basename(inputPath, extname(inputPath));
  const pdfOutput = outputPath || join(inputDir, `${inputName}.pdf`);

  const missing = (tool: string): CompileResult => ({
    file: inputPath,
    engine,
    pages: null,
    expected_pages: null,
    status: "failed",
    error: `${tool} not found on PATH`,
    missingTool: tool,
    duration_ms: Math.round(performance.now() - start),
  });

  try {
    let cmd: string[];
    if (engine === "typst") {
      const typstCommand = resolveTypstCommand(CODE_ROOT);
      const bunx = typstCommand ? null : resolveBin("bunx");
      if (!typstCommand && !bunx) return missing("typst");
      cmd = typstCommand
        ? [...typstCommand, "compile", "--root", typstRoot(), inputPath, pdfOutput]
        : [bunx!, "typst", "compile", "--root", typstRoot(), inputPath, pdfOutput];
    } else if (engine === "lualatex") {
      const lualatex = resolveBin("lualatex");
      if (!lualatex) return missing("lualatex");
      cmd = [
        lualatex,
        "-interaction=nonstopmode",
        "-output-directory",
        inputDir,
        "-jobname",
        inputName,
        inputPath,
      ];
    } else {
      const xelatex = resolveBin("xelatex");
      if (!xelatex) return missing("xelatex");
      cmd = [
        xelatex,
        "-interaction=nonstopmode",
        "-output-directory",
        inputDir,
        "-jobname",
        inputName,
        inputPath,
      ];
    }

    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: CODE_ROOT,
      env: { ...process.env, PATH: augmentedPath() },
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const duration = Math.round(performance.now() - start);

    if (exitCode !== 0) {
      const errorLines = stderr.split("\n").slice(-10).join("\n");
      return {
        file: inputPath,
        engine,
        pages: null,
        expected_pages: null,
        status: "failed",
        error: errorLines || `Exit code ${exitCode}`,
        duration_ms: duration,
      };
    }

    const pages = extractPageCount(stdout, engine);

    return {
      file: inputPath,
      engine,
      pages,
      expected_pages: null,
      status: "success",
      duration_ms: duration,
    };
  } catch (err) {
    return {
      file: inputPath,
      engine,
      pages: null,
      expected_pages: null,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Math.round(performance.now() - start),
    };
  }
}

function extractPageCount(stdout: string, engine: CompileEngine): number | null {
  if (engine === "typst") {
    const match = stdout.match(/compiled\s+to\s+(\S+\.pdf)/i);
    if (match) return null; // Typst doesn't print page count
  }
  const match = stdout.match(/Output written on.*?\((\d+)\s+pages?\)/i);
  return match ? parseInt(match[1], 10) : null;
}

// ─── PDF Page Count ─────────────────────────────────────────────────────────

function getPdfPageCount(pdfPath: string): number | null {
  if (!existsSync(pdfPath)) return null;
  try {
    const content = readFileSync(pdfPath, "utf-8");
    const matches = content.match(/\/Type\s*\/Page(?!\s*s)/g);
    return matches ? matches.length : null;
  } catch {
    return null;
  }
}

// ─── ATS Check ──────────────────────────────────────────────────────────────

async function extractText(pdfPath: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["pdftotext", "-layout", "--", pdfPath, "-"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return await new Response(proc.stdout).text();
  } catch {
    return null;
  }
}

function checkAtsQuality(text: string): { pass: boolean; issues: string[] } {
  const issues: string[] = [];
  if (text.includes("(cid:")) issues.push("Contains (cid:*) markers — font embedding issue");
  if (text.includes("�")) issues.push("Contains replacement characters — encoding issue");
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  if (!emailRegex.test(text)) issues.push("No email found in text layer — may be icon-only");
  return { pass: issues.length === 0, issues };
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function cmdBuild(
  input: string | undefined,
  options: { all?: boolean; output?: string; format?: string },
  config: BuildConfig
): Promise<void> {
  if (options.all) {
    const results: CompileResult[] = [];
    for (const dir of config.sourceDirs) {
      const dirPath = join(config.root, dir);
      if (!existsSync(dirPath)) continue;
      const files = readdirSync(dirPath).filter((f) =>
        config.sourceExts.some((ext) => f.endsWith(ext))
      );
      for (const file of files) {
        const filePath = join(dirPath, file);
        console.log(`Building: ${filePath}`);
        const result = await compile(filePath);
        results.push(result);
        const pageStr = result.pages !== null ? `${result.pages}p` : "?p";
        const icon = result.status === "success" ? "✓" : "✗";
        console.log(`  ${icon} ${result.engine} → ${pageStr} (${result.duration_ms}ms)`);
        if (result.status === "failed" && result.error) {
          console.log(`  Error: ${result.error.split("\n").pop()}`);
        }
      }
    }
    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "failed").length;
    console.log(`\nBuild complete: ${succeeded} succeeded, ${failed} failed`);
    if (failed > 0) process.exit(1);
    return;
  }

  if (!input) {
    console.error("Error: Provide a file path or use --all");
    console.error('Run "build --help" for usage');
    process.exit(1);
  }

  const inputPath = resolve(process.cwd(), input);
  if (!existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Building: ${inputPath}`);
  const result = await compile(
    inputPath,
    options.output ? resolve(process.cwd(), options.output) : undefined
  );

  if (result.status === "success") {
    const pdfPath = result.file.replace(/\.(typ|tex)$/, ".pdf");
    const pages = getPdfPageCount(pdfPath) ?? result.pages;
    console.log(`✓ ${result.engine} → ${pages} pages (${result.duration_ms}ms)`);

    // ATS check
    const text = await extractText(pdfPath);
    if (text !== null) {
      const check = checkAtsQuality(text);
      if (check.pass) {
        console.log("✓ ATS text layer: clean");
      } else {
        console.log("✗ ATS text layer issues:");
        for (const issue of check.issues) {
          console.log(`  ⚠ ${issue}`);
        }
      }
    } else {
      console.log("○ ATS check skipped (pdftotext not installed)");
    }
  } else {
    console.log(`✗ Build failed: ${result.error?.split("\n").pop()}`);
    process.exit(1);
  }
}

async function cmdVerify(_options: Record<string, never>, config: BuildConfig): Promise<void> {
  console.log("\nATS Verification Report\n");
  for (const dir of config.sourceDirs) {
    const dirPath = join(config.root, dir);
    if (!existsSync(dirPath)) continue;
    const pdfs = readdirSync(dirPath).filter((f) => f.endsWith(".pdf"));
    for (const pdf of pdfs) {
      const pdfPath = join(dirPath, pdf);
      const pages = getPdfPageCount(pdfPath);
      const text = await extractText(pdfPath);
      let status = "skipped";
      let issues: string[] = [];
      if (text !== null) {
        const check = checkAtsQuality(text);
        status = check.pass ? "pass" : "fail";
        issues = check.issues;
      } else {
        status = "unavailable";
        issues = ["pdftotext not installed"];
      }
      const icon = status === "pass" ? "✓" : status === "fail" ? "✗" : "○";
      console.log(`  ${icon} ${pdf} — ${pages ?? "?"} pages — ATS: ${status}`);
      for (const issue of issues) {
        console.log(`    ⚠ ${issue}`);
      }
    }
  }
}



function cmdConfig(_options: Record<string, never>, config: BuildConfig): Promise<void> {
  console.log(JSON.stringify(config, null, 2));
  return Promise.resolve();
}

// ─── Help ───────────────────────────────────────────────────────────────────

function showHelp(): void {
  console.log(`
${CLI_NAME} - Document Build CLI (v${VERSION})
${"=".repeat(50)}

USAGE:
  ${CLI_NAME} <command> [arguments] [options]

COMMANDS:
  build <file.typ|tex>        Build a single document
  build --all                 Build all templates in assets/cv/ and assets/cover_letters/
  verify                      Verify existing PDFs (ATS, page count)
  config                      Show current build configuration
  help, --help, -h            Show this help

OPTIONS:
  --all                       Build all source files
  --output, -o <path>         Custom output path
  --format <type>             Output format: pdf (default), docx, both

EXAMPLES:
  # Build a Typst CV
  $ ${CLI_NAME} build cv/banking/template.typ

  # Build everything
  $ ${CLI_NAME} build --all

  # Show config
  $ ${CLI_NAME} config

CONFIGURATION:
  Naming: data/config.json (name, dirs, separators)
  Pipeline: .env (BUILD_PIPELINE=minimal|generate-only|full)

OUTPUT:
  JSON to stdout (when piping)
  Errors to stderr
  Exit code: 0 = success, 1 = error
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      all: { type: "boolean" },
      output: { type: "string", short: "o" },
      format: { type: "string", default: "pdf" },
      steps: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
    allowPositionals: true,
  });

  if (values.help || positionals[0] === "help") {
    showHelp();
    return;
  }

  const config = loadBuildConfig();
  const command = positionals[0];

  switch (command) {
    case "build":
      await cmdBuild(positionals[1], values as { all?: boolean; output?: string; format?: string }, config);
      break;
    case "verify":
      await cmdVerify({}, config);
      break;

    case "config":
      await cmdConfig({}, config);
      break;
    default:
      if (command) {
        console.error(`Unknown command: ${command}`);
        console.error('Run "build --help" for usage');
        process.exit(1);
      }
      showHelp();
  }
}

if (import.meta.main) main();
