/**
 * Workspace data commands: where it is, back it up, move it.
 *
 * Personal data is copied, never moved or deleted: a migration that fails
 * half-way must leave the original untouched. SQLite is copied with
 * `VACUUM INTO`, which produces a consistent snapshot even while WAL files exist.
 */
import { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CODE_ROOT, WORKSPACE, isCheckout } from "../paths.js";
import { resolveBin } from "../resolve-bin.js";
import { AgentError, EXIT, confirmWrite, str, type CommandResult, type Values } from "./contract.js";

/** Workspace-relative paths that make up a user's data. */
export const DATA_ITEMS = [
  "data/profile.json",
  "data/config.json",
  "data/tracker.db",
  "data/seen-jobs.json",
  "data/reasoning.json",
  "data/outcomes.json",
  "data/jd",
  "data/market",
  "data/reports",
  "assets/applications",
  "assets/photos",
] as const;

export function workspaceSource(env: NodeJS.ProcessEnv = process.env): "env" | "checkout" | "xdg" {
  if (env.JOB_SEARCH_HOME) return "env";
  return isCheckout(WORKSPACE) ? "checkout" : "xdg";
}

function present(root: string): Record<string, boolean> {
  return Object.fromEntries(DATA_ITEMS.map((item) => [item, existsSync(join(root, item))]));
}

export async function dataWhere(): Promise<CommandResult> {
  return {
    data: {
      workspace: WORKSPACE,
      resolvedFrom: workspaceSource(),
      codeRoot: CODE_ROOT,
      items: present(WORKSPACE),
      override: "set JOB_SEARCH_HOME to use another workspace",
    },
  };
}

function copyItem(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  if (from.endsWith(".db")) {
    const db = new Database(from, { readonly: true });
    try {
      db.exec(`VACUUM INTO '${to.replace(/'/g, "''")}'`);
    } finally {
      db.close();
    }
    return;
  }
  cpSync(from, to, { recursive: true, errorOnExist: true, force: false });
}

export async function dataMigrate(values: Values): Promise<CommandResult> {
  const from = resolve(process.cwd(), str(values, "from")!);
  const to = resolve(process.cwd(), str(values, "to") ?? WORKSPACE);
  if (!existsSync(from) || !statSync(from).isDirectory()) throw new AgentError("not_found", `source workspace not found: ${from}`);
  if (from === to) throw new AgentError("validation", "source and target are the same directory");

  const plan: Array<{ item: string; action: "copy" | "skip-missing" | "conflict" }> = DATA_ITEMS.map((item) => {
    if (!existsSync(join(from, item))) return { item, action: "skip-missing" };
    if (existsSync(join(to, item))) return { item, action: "conflict" };
    return { item, action: "copy" };
  });
  const conflicts = plan.filter((p) => p.action === "conflict").map((p) => p.item);
  const preview = confirmWrite(values, "data-migrate", `jobsearch data-migrate --from ${JSON.stringify(from)}`);
  if (preview) return { data: { from, to, plan, conflicts, dryRun: true }, exit: EXIT.dryRun };
  if (conflicts.length > 0) {
    throw new AgentError("conflict", `target already has ${conflicts.length} item(s); nothing was copied`, ["move or back up the target items first", "jobsearch data-backup --yes"], true, { conflicts });
  }
  const copied: string[] = [];
  for (const p of plan) {
    if (p.action !== "copy") continue;
    copyItem(join(from, p.item), join(to, p.item));
    copied.push(p.item);
  }
  return { data: { from, to, copied, sourceUntouched: true, next: `export JOB_SEARCH_HOME=${JSON.stringify(to)} (or leave unset when it is the default)` } };
}

export async function dataBackup(values: Values): Promise<CommandResult> {
  const existing = DATA_ITEMS.filter((item) => existsSync(join(WORKSPACE, item)));
  if (existing.length === 0) throw new AgentError("not_found", `nothing to back up in ${WORKSPACE}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(process.cwd(), str(values, "out") ?? join(WORKSPACE, "backups"));
  const archive = join(outDir, `job-search-${stamp}.tar.gz`);
  const preview = confirmWrite(values, "data-backup", "jobsearch data-backup");
  if (preview) return { data: { archive, items: existing, dryRun: true }, exit: EXIT.dryRun };
  const tar = resolveBin("tar");
  if (!tar) throw new AgentError("unavailable", "tar is not installed", ["install tar, or copy the items listed by `jobsearch data-where` manually"]);
  mkdirSync(outDir, { recursive: true });
  const proc = Bun.spawnSync([tar, "-czf", archive, "-C", WORKSPACE, ...existing], { stderr: "pipe" });
  if (proc.exitCode !== 0) throw new AgentError("external", `tar failed: ${proc.stderr.toString().trim()}`);
  return { data: { archive, items: existing, bytes: statSync(archive).size } };
}

/** Names of postings saved in the workspace (for status). */
export function savedPostings(): string[] {
  const dir = join(WORKSPACE, "data", "jd");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(txt|md)$/i.test(f));
}
