/**
 * `jobsearch tools-install`: a persistent document toolchain without a global
 * install. The pilot only reached real compile/raster gates by putting a
 * scratch-cached Typst on PATH by hand (issue #9); this downloads an official
 * Typst release into <workspace>/data/tools/bin, which resolveBin searches.
 * The archive is verified against a SHA-256 pinned here before it is unpacked,
 * so only the reviewed upstream bytes are ever executed.
 */
import { createHash } from "node:crypto";
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

/**
 * SHA-256 of each official release archive, by version and archive name.
 * Recorded from https://github.com/typst/typst/releases/tag/v0.13.1 (sizes
 * match the GitHub release API). A version without pins here is refused: add
 * its four hashes in a reviewed change to support it.
 */
export const TYPST_SHA256: Record<string, Record<string, string>> = {
  "0.13.1": {
    "typst-x86_64-unknown-linux-musl.tar.xz": "7d214bfeffc2e585dc422d1a09d2b144969421281e8c7f5d784b65fc69b5673f",
    "typst-aarch64-unknown-linux-musl.tar.xz": "4f5b7ee6e57fb639019ee0f6bffcf940edad228ede6ff5269a9f05a1544ceed4",
    "typst-x86_64-apple-darwin.tar.xz": "4dabfe647f7f01ed9cc13ad8196a6c7f5e16f0732821b522d50740d3a9f5207b",
    "typst-aarch64-apple-darwin.tar.xz": "541e4f9eaca3f34ee865f81fc663e4839cb84d6253f71a372cd855b0a7283213",
  },
};

export function typstRelease(version: string, platform = process.platform, arch = process.arch): { url: string; archive: string; inner: string; sha256: string } {
  const target = TARGETS[`${platform}-${arch}`];
  if (!target) throw new AgentError("unavailable", `no prebuilt Typst for ${platform}/${arch}; install it with your package manager`, ["https://github.com/typst/typst#installation"]);
  const archive = `typst-${target}.tar.xz`;
  const sha256 = TYPST_SHA256[version]?.[archive];
  if (!sha256) throw new AgentError("validation", `no pinned checksum for Typst ${version} (${archive}); tools-install only installs checksum-pinned releases`, [`jobsearch tools-install --tool typst --version ${TYPST_VERSION} --dry-run`, "https://github.com/typst/typst#installation"]);
  return { url: `https://github.com/typst/typst/releases/download/v${version}/${archive}`, archive, inner: `typst-${target}/typst`, sha256 };
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
  const plan = { tool, version, url: release.url, sha256: release.sha256, path: dest, replaces: existing };

  if (existing?.includes(`typst ${version}`)) return { data: { ...plan, alreadyInstalled: true } };
  if (confirmWrite(values, "tools-install", `jobsearch tools-install --tool typst --version ${version}`)) return { data: { dryRun: true, ...plan }, exit: EXIT.dryRun };

  const tar = resolveBin("tar");
  if (!tar) throw new AgentError("unavailable", "tar is needed to unpack the Typst release");
  mkdirSync(dir, { recursive: true });
  const work = mkdtempSync(join(dir, ".download-"));
  try {
    const response = await fetch(release.url);
    if (!response.ok) throw new AgentError("external", `download failed: HTTP ${response.status} for ${release.url}`, ["check the network or proxy, then retry"]);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== release.sha256) throw new AgentError("external", `checksum mismatch for ${release.archive}: got sha256 ${digest}, expected ${release.sha256}; nothing was installed`, ["retry; if it persists, the download was altered or the pin is wrong: do not bypass"]);
    writeFileSync(join(work, release.archive), bytes);
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
    summary: "Install a pinned, checksum-verified Typst release into <workspace>/data/tools/bin (no global install); --dry-run shows the URL, SHA-256 and path",
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
