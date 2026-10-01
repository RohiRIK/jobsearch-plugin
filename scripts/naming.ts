#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { basename, extname, relative, resolve } from "node:path";
import { buildSourcePath, loadConfig, parseFileName, walkDocuments } from "../src/naming.js";
import { WORKSPACE as ROOT } from "../src/paths.js";


const HELP = `Naming Convention CLI — lint document files against <Name>_<Company>_<Role>_<CV|CL>.

Usage:
  naming.ts check                 Lint every document under the applications tree (+ legacy flat dirs)
  naming.ts show <company> <role> Print the convention-correct grouped paths

Convention (owned by src/naming.ts + data/config.json):
  <applicationsDir>/<Company>/<YYYY-MM-DD>/<Name>_<Company>_<Role>_<CV|CL>.<ext>
Words inside a field use "-", fields join with "_", no spaces anywhere.

Output: JSON { compliant, violations: [{ file, reason, suggestion }] }. Exit 0 if all compliant, 1 otherwise.`;

const IGNORED_FILES = new Set(["main_example.tex", ".gitkeep", "README.md"]);
const DOC_EXTS = new Set([".typ", ".tex", ".pdf", ".docx"]);

export interface Violation {
  file: string;
  reason: string;
  suggestion: string;
}

export function checkTree(dirs: string[]): { compliant: string[]; violations: Violation[] } {
  const compliant: string[] = [];
  const violations: Violation[] = [];
  const cfg = loadConfig();

  for (const dir of dirs) {
    for (const abs of walkDocuments(resolve(ROOT, dir), DOC_EXTS)) {
      const file = basename(abs);
      const ext = extname(file);
      if (IGNORED_FILES.has(file) || file.startsWith("OpenFonts")) continue;
      const rel = relative(ROOT, abs);
      const parsed = parseFileName(basename(file, ext), cfg);
      if (!parsed) {
        violations.push({
          file: rel,
          reason: file.includes(" ") ? "contains spaces" : "does not match <Name>_<Company>_<Role>_<CV|CL>",
          suggestion: `regenerate with the CLI, or run: bun run naming show "<company>" "<role>" and git mv to the printed name`,
        });
      } else {
        compliant.push(rel);
      }
    }
  }
  return { compliant, violations };
}

export async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: { help: { type: "boolean", short: "h" } },
    strict: false,
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP + "\n");
    return values.help ? 0 : 1;
  }

  const cfg = loadConfig();
  const command = positionals[0] as string;

  if (command === "show") {
    const [company, role] = [positionals[1] as string, positionals[2] as string];
    if (!company || !role) {
      process.stderr.write(JSON.stringify({ error: "show requires <company> <role>", code: "BAD_ARGS" }) + "\n");
      return 1;
    }
    process.stdout.write(
      JSON.stringify(
        {
          cv: buildSourcePath("cv", company, role, cfg),
          cover: buildSourcePath("cl", company, role, cfg),
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }

  if (command === "check") {
    // Applications tree is the current layout; the flat dirs are scanned too so
    // any pre-migration documents still get linted.
    const { compliant, violations } = checkTree([cfg.applicationsDir, cfg.cvDir, cfg.coverDir]);
    process.stdout.write(JSON.stringify({ compliant, violations }, null, 2) + "\n");
    return violations.length > 0 ? 1 : 0;
  }

  process.stderr.write(JSON.stringify({ error: `unknown command: ${command}. Use check or show.`, code: "BAD_CMD" }) + "\n");
  return 1;
}

if (import.meta.main) {
  process.exit(await main());
}
