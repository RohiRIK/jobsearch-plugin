#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { resolveBin } from "../src/resolve-bin.js";

const HELP = `Doctor — check the toolchain and report which document features work on this machine.

Usage:
  doctor.ts [--format json|text]

Reports each external tool (found path or missing), the capabilities they unlock,
and an install hint for anything absent. Exit 0 if every REQUIRED tool is present,
1 otherwise (optional tools never fail the check).`;

interface ToolCheck {
  name: string;
  required: boolean;
  unlocks: string;
  installHint: string;
}

const TOOLS: ToolCheck[] = [
  { name: "bun", required: true, unlocks: "everything (runtime + package manager)", installHint: "curl -fsSL https://bun.sh/install | bash" },
  { name: "typst", required: false, unlocks: "Typst CV/cover compilation (bunx typst is the fallback)", installHint: "cargo install typst-cli — or rely on the bundled bunx typst" },
  { name: "lualatex", required: false, unlocks: "LaTeX CV compilation", installHint: "install TeX Live / MiKTeX" },
  { name: "xelatex", required: false, unlocks: "LaTeX cover-letter compilation (cover.cls needs fontspec)", installHint: "install TeX Live / MiKTeX" },
  { name: "pdftotext", required: false, unlocks: "ATS text-layer verification in reevaluate / verify-ats", installHint: "brew install poppler · apt install poppler-utils" },
  { name: "pdfinfo", required: false, unlocks: "accurate PDF page counts (falls back to a raw scan)", installHint: "brew install poppler · apt install poppler-utils" },
];

export interface DoctorResult {
  tool: string;
  status: "ok" | "missing";
  required: boolean;
  path: string | null;
  unlocks: string;
  installHint?: string;
}

export function runChecks(): DoctorResult[] {
  return TOOLS.map((t) => {
    const path = resolveBin(t.name);
    return {
      tool: t.name,
      status: path ? "ok" : "missing",
      required: t.required,
      path,
      unlocks: t.unlocks,
      ...(path ? {} : { installHint: t.installHint }),
    };
  });
}

export async function main(): Promise<number> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { format: { type: "string" }, help: { type: "boolean", short: "h" } },
    strict: false,
  });

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  const results = runChecks();
  const missingRequired = results.filter((r) => r.required && r.status === "missing");
  const ok = missingRequired.length === 0;

  if (values.format === "json") {
    process.stdout.write(JSON.stringify({ ok, results }, null, 2) + "\n");
  } else {
    const lines: string[] = ["Toolchain check:"];
    for (const r of results) {
      const mark = r.status === "ok" ? "✓" : r.required ? "✗" : "–";
      lines.push(`  ${mark} ${r.tool}${r.required ? " (required)" : ""}: ${r.status === "ok" ? r.path : "missing"}`);
      lines.push(`      ${r.unlocks}`);
      if (r.installHint) lines.push(`      install: ${r.installHint}`);
    }
    lines.push("");
    lines.push(ok ? "All required tools present." : `Missing required: ${missingRequired.map((r) => r.tool).join(", ")}`);
    process.stdout.write(lines.join("\n") + "\n");
  }
  return ok ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
