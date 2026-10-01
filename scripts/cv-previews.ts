#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ApplicationDraft, buildApplicationBrief } from "../src/application-draft.js";
import { renderCvTypst } from "../src/application-renderers.js";
import { CV_LAYOUTS } from "../src/cv-options.js";
import { Profile } from "../src/profile-schemas.js";
import { resolveTypstCommand } from "../src/resolve-bin.js";
import { CODE_ROOT, WORKSPACE as ROOT, typstRoot } from "../src/paths.js";


const HELP = `cv:previews — render every supported CV layout from one approved draft

Usage:
  bun run cv:previews --draft <draft.json> --job <posting.txt> [options]

Options:
  --profile <path>       Profile JSON (default: data/profile.json)
  --company <name>       Company (default: draft company)
  --role <title>         Role (default: draft role)
  --market <code>        Force a market
  --out <dir>            Output directory (default: assets/cv-previews)
  --ppi <n>              PNG resolution (default: 130)
  --help                 Show this help

The same validated draft is rendered through every layout variant so the user
can compare hierarchy and density without the content changing underneath them.
Unreviewed or restricted projects never enter the draft ledger.
`;

async function main(): Promise<number> {
  const args = Bun.argv.slice(2);
  const value = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  if (args.includes("--help")) {
    process.stdout.write(HELP);
    return 0;
  }
  const draftPath = value("--draft");
  const jobPath = value("--job");
  if (!draftPath || !jobPath) {
    process.stderr.write(JSON.stringify({ error: "--draft and --job are required", code: "BAD_ARGS" }) + "\n");
    return 1;
  }
  const profilePath = resolve(process.cwd(), value("--profile") ?? join(ROOT, "data", "profile.json"));
  if (!existsSync(profilePath)) {
    process.stderr.write(JSON.stringify({ error: "profile not found. Ask the agent to set up the profile first.", code: "NO_PROFILE" }) + "\n");
    return 1;
  }
  const profile = Profile.parse(JSON.parse(readFileSync(profilePath, "utf-8")));
  const draft = ApplicationDraft.parse(JSON.parse(readFileSync(resolve(process.cwd(), draftPath), "utf-8")));
  const posting = readFileSync(resolve(process.cwd(), jobPath), "utf-8");
  const brief = buildApplicationBrief({
    profile,
    posting,
    company: value("--company") ?? draft.company,
    role: value("--role") ?? draft.role,
    market: value("--market"),
  });
  const outDir = resolve(process.cwd(), value("--out") ?? join(ROOT, "assets", "cv-previews"));
  if (outDir !== ROOT && !outDir.startsWith(`${ROOT}/`)) {
    process.stderr.write(JSON.stringify({ error: "preview output must stay inside the project root for Typst", code: "OUTSIDE_ROOT" }) + "\n");
    return 1;
  }
  const ppi = value("--ppi") ?? "130";
  mkdirSync(outDir, { recursive: true });
  const typst = resolveTypstCommand(CODE_ROOT);
  if (!typst) {
    process.stderr.write(JSON.stringify({ error: "Typst is unavailable", code: "NO_TYPST" }) + "\n");
    return 1;
  }

  const results: Array<{ layout: string; pngs: string[]; recommended: boolean }> = [];
  for (const option of CV_LAYOUTS) {
    const source = join(outDir, `${option.id}.typ`);
    const pngPattern = join(outDir, `${option.id}-page-{n}.png`);
    writeFileSync(source, renderCvTypst({ profile, draft, outDir, template: "modern", market: brief.market, layout: option.id, supportsAvatar: option.supportsAvatar }));
    const proc = Bun.spawn([...typst, "compile", "--root", typstRoot(), source, pngPattern, "--ppi", ppi], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    if (await proc.exited !== 0) {
      process.stderr.write(JSON.stringify({ error: `layout ${option.id} failed`, detail: `${stdout}${stderr}` }) + "\n");
      return 1;
    }
    const prefix = `${option.id}-page-`;
    const pngs = readdirSync(outDir)
      .filter((file) => file.startsWith(prefix) && file.endsWith(".png"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((file) => join(outDir, file));
    results.push({ layout: option.id, pngs, recommended: option.id === brief.layoutRecommendation.recommended });
  }
  process.stdout.write(JSON.stringify({ outDir, recommended: brief.layoutRecommendation.recommended, results }, null, 2) + "\n");
  return 0;
}

if (import.meta.main) process.exit(await main());
