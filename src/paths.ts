/**
 * The one place that knows where things live. Two roots, never mixed:
 *
 *   CODE_ROOT  templates, portal CLIs, example files — the repo checkout in
 *              development, the installed plugin directory once bundled.
 *   WORKSPACE  personal data with the same layout as a checkout:
 *              `data/` (profile, tracker, jd, …) and `assets/` (applications,
 *              photos, legacy CVs). Never inside the plugin, so upgrading or
 *              uninstalling the plugin cannot touch it.
 *
 * WORKSPACE resolution: JOB_SEARCH_HOME → the checkout when running from one
 * (today's behaviour, unchanged) → the checkout that contains the plugin
 * directory → ${XDG_DATA_HOME:-~/.local/share}/job-search. Host plugin data
 * dirs (${CLAUDE_PLUGIN_DATA}, Hermes ${PLUGIN_DATA}) are deliberately not in
 * the list: Claude Code deletes its plugin data dir on uninstall.
 *
 * Every other module imports these instead of doing `import.meta.dir` path
 * math — a bundled build moves the code, and relative math then resolves to a
 * directory that silently does not exist. tests/paths.test.ts enforces this.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

const CHECKOUT_PACKAGE = "ai-job-search";

/** True when `dir` is a source checkout of this repository. */
export function isCheckout(dir: string): boolean {
  const pkg = join(dir, "package.json");
  if (!existsSync(pkg) || !existsSync(join(dir, "src"))) return false;
  try {
    return JSON.parse(readFileSync(pkg, "utf-8")).name === CHECKOUT_PACKAGE;
  } catch {
    return false;
  }
}

/** Where templates and other shipped files live. The launcher sets JOB_SEARCH_PLUGIN_ROOT. */
export function codeRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.JOB_SEARCH_PLUGIN_ROOT) return resolve(env.JOB_SEARCH_PLUGIN_ROOT);
  return resolve(import.meta.dir, "..");
}

export function workspaceRoot(env: NodeJS.ProcessEnv = process.env, code: string = codeRoot(env)): string {
  if (env.JOB_SEARCH_HOME) return resolve(env.JOB_SEARCH_HOME);
  if (isCheckout(code)) return code;
  if (isCheckout(dirname(code))) return dirname(code);
  const xdg = env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(xdg, "job-search");
}

/** Throwaway, rebuildable state (triage cache). Safe to lose. */
export function cacheRoot(env: NodeJS.ProcessEnv = process.env, workspace: string = workspaceRoot(env)): string {
  if (env.JOB_SEARCH_CACHE) return resolve(env.JOB_SEARCH_CACHE);
  return join(workspace, "data", "cache");
}

export const CODE_ROOT = codeRoot();
export const WORKSPACE = workspaceRoot();
export const TEMPLATES_DIR = join(CODE_ROOT, "templates");
export const DATA_DIR = join(WORKSPACE, "data");

/**
 * Typst refuses imports outside --root. Generated sources live in the
 * workspace and import templates from the code root, so compile with their
 * closest common ancestor. In a checkout both are the same directory.
 */
export function typstRoot(a: string = CODE_ROOT, b: string = WORKSPACE): string {
  const pa = resolve(a).split(sep);
  const pb = resolve(b).split(sep);
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
  return pa.slice(0, i).join(sep) || sep;
}
