#!/usr/bin/env bun
/**
 * plugin:build — make job-search/ self-contained.
 *
 *   job-search/dist/jobsearch.js       the agent CLI + MCP server
 *   job-search/dist/tools.js           every delegated tool in one file (src/jobsearch/toolmap.ts)
 *   job-search/dist/portals/<name>.js  portal scrapers, dependencies inlined
 *   job-search/templates/              Typst templates + design system
 *   job-search/data/profile.json.example  placeholder profile for profile:scaffold
 *   job-search/dist/BUILD.json         source hash + per-file hashes
 *
 * Marketplace installs are a plain copy with no build step, so the output is
 * committed. tests/plugin-bundle.test.ts recomputes the source hash and fails
 * when the committed bundle is stale. `@napi-rs/canvas` (64 MB native) stays
 * external; only the raster gate loads it, lazily.
 *
 * Usage: bun run plugin:build [--check]   (--check: exit 1 if stale, build nothing)
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { CODE_ROOT as ROOT } from "../../src/paths.js";
import { PORTALS } from "../pipeline/cli.js";

export const PLUGIN_DIR = join(ROOT, "job-search");
const DIST = join(PLUGIN_DIR, "dist");
const EXTERNAL = ["@napi-rs/canvas"];
/**
 * Portals built on @bunli/core pull in a TUI stack (4.3 MB JS + 3.4 MB of
 * tree-sitter wasm) for a two-command scraper. They stay checkout-only; in a
 * plugin install `scrape` reports them as errored with a reason, never silently.
 */
export const CHECKOUT_ONLY_PORTALS = new Set(["jobindex", "jobbank"]);

/** Everything whose change can change the bundle. */
export function sourceFiles(root: string = ROOT): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "tests" || entry === "public") continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(ts|typ|json)$/.test(entry) && !entry.endsWith(".test.ts")) out.push(full);
    }
  };
  walk(join(root, "src"));
  walk(join(root, "scripts"));
  walk(join(root, "templates"));
  for (const [name, portal] of Object.entries(PORTALS)) if (!CHECKOUT_ONLY_PORTALS.has(name)) walk(join(root, portal.path, ".."));
  out.push(join(root, "bun.lock"), join(root, "data", "profile.json.example"));
  return out.filter((f) => existsSync(f)).sort();
}

export function sourceHash(root: string = ROOT): string {
  const h = createHash("sha256");
  for (const file of sourceFiles(root)) {
    h.update(relative(root, file));
    h.update("\0");
    h.update(readFileSync(file));
    h.update("\0");
  }
  return h.digest("hex");
}

export function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function bundle(entry: string, outfile: string): Promise<void> {
  const result = await Bun.build({ entrypoints: [entry], target: "bun", external: EXTERNAL, minify: { syntax: true, whitespace: true } });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`bundle failed: ${entry}`);
  }
  if (result.outputs.length !== 1) throw new Error(`expected one output for ${entry}, got ${result.outputs.length}`);
  mkdirSync(join(outfile, ".."), { recursive: true });
  writeFileSync(outfile, await result.outputs[0].text());
}

function copyTemplates(): void {
  const target = join(PLUGIN_DIR, "templates");
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(join(ROOT, "templates", "design-system.typ"), join(target, "design-system.typ"));
  // Only template sources: a local compile leaves ignored PDFs/PNGs beside them,
  // and copying those records files in BUILD.json that a fresh checkout lacks.
  for (const kind of ["cv", "cover"]) {
    cpSync(join(ROOT, "templates", kind), join(target, kind), {
      recursive: true,
      filter: (src) => statSync(src).isDirectory() || /\.(typ|json)$/.test(src),
    });
  }
  // profile:scaffold / profile:check read the placeholder profile from the code root.
  mkdirSync(join(PLUGIN_DIR, "data"), { recursive: true });
  cpSync(join(ROOT, "data", "profile.json.example"), join(PLUGIN_DIR, "data", "profile.json.example"));
}

export async function build(): Promise<{ files: Record<string, string>; sourceHash: string; bytes: number }> {
  rmSync(DIST, { recursive: true, force: true });
  await bundle(join(ROOT, "scripts", "jobsearch.ts"), join(DIST, "jobsearch.js"));
  await bundle(join(ROOT, "scripts", "plugin", "tools-entry.ts"), join(DIST, "tools.js"));
  for (const [name, portal] of Object.entries(PORTALS)) if (!CHECKOUT_ONLY_PORTALS.has(name)) await bundle(join(ROOT, portal.path), join(DIST, "portals", `${name}.js`));
  copyTemplates();

  const files: Record<string, string> = {};
  let bytes = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry !== "BUILD.json") {
        files[relative(PLUGIN_DIR, full)] = fileHash(full);
        bytes += statSync(full).size;
      }
    }
  };
  walk(DIST);
  walk(join(PLUGIN_DIR, "templates"));
  walk(join(PLUGIN_DIR, "data"));
  const manifest = { sourceHash: sourceHash(), bun: Bun.version, bytes, files };
  writeFileSync(join(DIST, "BUILD.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    const path = join(DIST, "BUILD.json");
    const current = existsSync(path) ? (JSON.parse(readFileSync(path, "utf-8")) as { sourceHash: string }).sourceHash : null;
    const fresh = current === sourceHash();
    console.log(JSON.stringify({ ok: fresh, stale: !fresh, hint: fresh ? undefined : "bun run plugin:build" }));
    process.exit(fresh ? 0 : 1);
  }
  const manifest = await build();
  console.log(JSON.stringify({ ok: true, files: Object.keys(manifest.files).length, bytes: manifest.bytes, sourceHash: manifest.sourceHash }));
}
