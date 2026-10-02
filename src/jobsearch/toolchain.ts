/**
 * `jobsearch tools-install`: a persistent document toolchain without a global
 * install. The pilot only reached real compile/raster gates by putting a
 * scratch-cached Typst on PATH by hand (issue #9); this downloads an official
 * Typst release into <workspace>/data/tools/bin, which resolveBin searches.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toolsBinDir } from "../paths.js";
import { resolveBin } from "../resolve-bin.js";
import { AgentError, EXIT, confirmWrite, str, type CommandResult, type CommandSpec, type Values } from "./contract.js";

/** Pinned: 0.12+ is what the templates' keep-with-next needs; bump deliberately. */
export const TYPST_VERSION = "0.13.1";

const TARGETS: Record<string, string> = {
  "linux-x64": "x86_64-unknown-linux-musl",
  "linux-arm64": "aarch64-unknown-linux-musl",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
};

export function typstRelease(version: string, platform = process.platform, arch = process.arch): { url: string; archive: string; inner: string } {
  const target = TARGETS[`${platform}-${arch}`];
  if (!target) throw new AgentError("unavailable", `no prebuilt Typst for ${platform}/${arch}; install it with your package manager`, ["https://github.com/typst/typst#installation"]);
  const archive = `typst-${target}.tar.xz`;
  return { url: `https://github.com/typst/typst/releases/download/v${version}/${archive}`, archive, inner: `typst-${target}/typst` };
}

function versionOf(bin: string): string | null {
  const proc = Bun.spawnSync([bin, "--version"]);
  return proc.exitCode === 0 ? proc.stdout.toString().trim() : null;
}

async function runToolsInstall(values: Values): Promise<CommandResult> {
  const tool = str(values, "tool") ?? "typst";
  if (tool !== "typst") throw new AgentError("validation", `tools-install supports typst only, got ${JSON.stringify(tool)}`, ["jobsearch tools-install --tool typst --dry-run"]);
  const version = str(values, "version") ?? TYPST_VERSION;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new AgentError("validation", "--version must be x.y.z");
  const release = typstRelease(version);
  const dir = toolsBinDir();
  const dest = join(dir, "typst");
  const existing = existsSync(dest) ? versionOf(dest) : null;
  const plan = { tool, version, url: release.url, path: dest, replaces: existing };

  if (existing?.includes(`typst ${version}`)) return { data: { ...plan, alreadyInstalled: true } };
  if (confirmWrite(values, "tools-install", `jobsearch tools-install --tool typst --version ${version}`)) return { data: { dryRun: true, ...plan }, exit: EXIT.dryRun };

  const tar = resolveBin("tar");
  if (!tar) throw new AgentError("unavailable", "tar is needed to unpack the Typst release");
  mkdirSync(dir, { recursive: true });
  const work = mkdtempSync(join(dir, ".download-"));
  try {
    const response = await fetch(release.url);
    if (!response.ok) throw new AgentError("external", `download failed: HTTP ${response.status} for ${release.url}`, ["check the network or proxy, then retry"]);
    writeFileSync(join(work, release.archive), new Uint8Array(await response.arrayBuffer()));
    const unpack = Bun.spawnSync([tar, "-xJf", join(work, release.archive), "-C", work]);
    if (unpack.exitCode !== 0) throw new AgentError("external", `could not unpack ${release.archive}: ${unpack.stderr.toString().trim()}`, ["install xz (tar needs it for .tar.xz)"]);
    const unpacked = join(work, release.inner);
    if (!existsSync(unpacked) || !statSync(unpacked).isFile()) throw new AgentError("external", `archive did not contain ${release.inner}: ${readdirSync(work).join(", ")}`);
    chmodSync(unpacked, 0o755);
    const got = versionOf(unpacked);
    if (!got?.includes(`typst ${version}`)) throw new AgentError("external", `downloaded binary reports ${JSON.stringify(got)}, expected typst ${version}`);
    renameSync(unpacked, dest);
    return { data: { ...plan, installed: true, reports: got, next: "jobsearch status (tools.typst should be true)" } };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export const TOOLCHAIN_COMMANDS: Record<string, CommandSpec> = {
  "tools-install": {
    summary: "Install a pinned Typst release into <workspace>/data/tools/bin (no global install); --dry-run shows the URL and path",
    mutation: true,
    output: "json",
    flags: {
      tool: { type: "string", description: "Tool to install (typst)" },
      version: { type: "string", description: `Typst version (default ${TYPST_VERSION})` },
      yes: { type: "boolean", description: "Download and install — only after a human yes in-conversation" },
      "dry-run": { type: "boolean", description: "Show the URL and destination; exit 10" },
    },
    run: runToolsInstall,
  },
};
