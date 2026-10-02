import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { toolsBinDir } from "./paths.js";

// Snap-packaged bun (Ubuntu) spawns with a stripped PATH, so external binaries
// like typst/pdftotext/pdfinfo are invisible to Bun.which alone. Probe the
// standard install locations across Linux and macOS before giving up.
// Snap-packaged Bun replaces HOME with a per-snap directory. Hermes supplies
// HERMES_REAL_HOME and Snap supplies SNAP_REAL_HOME; use either when present so
// user-installed tools remain discoverable from inside the confined runtime.
const REAL_HOME = process.env.HERMES_REAL_HOME ?? process.env.SNAP_REAL_HOME ?? homedir();
const HOME_DIRS = [...new Set([homedir(), REAL_HOME])];

const EXTRA_BIN_DIRS = [
  toolsBinDir(),
  "/usr/bin",
  "/usr/local/bin",
  "/snap/bin",
  "/opt/homebrew/bin",
  ...HOME_DIRS.flatMap((home) => [join(home, ".local", "bin"), join(home, ".cargo", "bin")]),
];

export function resolveBin(name: string): string | null {
  // Test seam: when set (non-empty), these directories are the whole search.
  // Without it a test cannot simulate "openclaw is not installed" on a machine
  // where it is.
  const only = process.env.JOB_SEARCH_BIN_PATH;
  if (only) {
    for (const dir of only.split(":").filter(Boolean)) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }
  const found = Bun.which(name);
  if (found) return found;
  for (const dir of EXTRA_BIN_DIRS) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function augmentedPath(): string {
  return [...EXTRA_BIN_DIRS, process.env.PATH ?? ""].join(":");
}

/**
 * Prefer the package-local Typst CLI when Bun runs under Snap confinement: a
 * native binary in the real home directory may be visible but not executable.
 * Running the package entry with the active Bun interpreter keeps tests and the
 * document CLI portable without requiring a separately installed Node runtime.
 */
export function resolveTypstCommand(projectRoot: string): string[] | null {
  const bundledEntrypoint = join(projectRoot, "node_modules", "typst", "dist", "main.js");
  if (process.env.SNAP && existsSync(bundledEntrypoint)) return [process.execPath, bundledEntrypoint];

  const native = resolveBin("typst");
  if (native) return [native];
  return existsSync(bundledEntrypoint) ? [process.execPath, bundledEntrypoint] : null;
}
