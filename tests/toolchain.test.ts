import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TYPST_SHA256, TYPST_VERSION, typstRelease } from "../src/jobsearch/toolchain.js";

const ROOT = resolve(import.meta.dir, "..");
let ws: string;
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "toolchain-"));
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

function js(args: string[]) {
  const proc = Bun.spawnSync([process.execPath, join(ROOT, "scripts/jobsearch.ts"), ...args], {
    env: { ...process.env, JOB_SEARCH_HOME: ws, JOB_SEARCH_TELEMETRY: "0", JOB_SEARCH_BIN_PATH: "" },
  });
  return { code: proc.exitCode, out: JSON.parse(proc.stdout.toString()) };
}

// Issue #9: the pilot needed a hand-made PATH entry for a cached Typst.
describe("tools-install", () => {
  test("pins a Typst new enough for the templates and maps each supported platform", () => {
    const [major, minor] = TYPST_VERSION.split(".").map(Number);
    expect(major > 0 || minor >= 12).toBe(true);
    expect(typstRelease("0.13.1", "linux", "x64").url).toBe("https://github.com/typst/typst/releases/download/v0.13.1/typst-x86_64-unknown-linux-musl.tar.xz");
    expect(typstRelease("0.13.1", "darwin", "arm64").inner).toBe("typst-aarch64-apple-darwin/typst");
    expect(() => typstRelease("0.13.1", "win32", "x64")).toThrow(/package manager/);
  });

  test("refuses without --yes and previews the URL, checksum and workspace path with --dry-run", () => {
    expect(js(["tools-install"]).out.error.type).toBe("confirmation_required");
    const preview = js(["tools-install", "--dry-run"]);
    expect(preview.code).toBe(10);
    expect(preview.out.data.path).toBe(join(ws, "data", "tools", "bin", "typst"));
    expect(preview.out.data.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  // Hermes catalog rule 17: a binary fetched at setup comes from the upstream
  // release, pinned by checksum.
  test("every supported platform of the pinned version has a SHA-256 pin", () => {
    for (const [platform, arch] of [["linux", "x64"], ["linux", "arm64"], ["darwin", "x64"], ["darwin", "arm64"]] as const) {
      const release = typstRelease(TYPST_VERSION, platform, arch);
      expect(release.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(TYPST_SHA256[TYPST_VERSION][release.archive]).toBe(release.sha256);
    }
  });

  test("a version without pinned checksums is refused before any download", () => {
    expect(() => typstRelease("0.12.0", "linux", "x64")).toThrow(/no pinned checksum/);
    const res = js(["tools-install", "--version", "0.12.0", "--dry-run"]);
    expect(res.code).not.toBe(0);
    expect(res.out.ok).toBe(false);
    expect(res.out.error.message).toMatch(/no pinned checksum/);
  });

  test("a binary in the workspace tools dir is found without any PATH change", () => {
    // JOB_SEARCH_BIN_PATH="" disables the test seam, so this is production discovery.
    const bin = join(ws, "data", "tools", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "typst"), "#!/bin/sh\necho typst 0.13.1\n", { mode: 0o755 });
    const proc = Bun.spawnSync([process.execPath, "-e", `import { resolveBin } from "${join(ROOT, "src/resolve-bin.ts")}"; console.log(resolveBin("typst"))`], {
      env: { ...process.env, JOB_SEARCH_HOME: ws, PATH: "/nonexistent", JOB_SEARCH_BIN_PATH: "" },
    });
    expect(proc.stdout.toString().trim()).toBe(join(bin, "typst"));
  });

  test("a download whose SHA-256 does not match the pin installs nothing", () => {
    // Runs in a child so the fetch stub cannot leak into other tests.
    const script = `
      globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3, 4]));
      const { TOOLCHAIN_COMMANDS } = await import("${join(ROOT, "src/jobsearch/toolchain.ts")}");
      try { await TOOLCHAIN_COMMANDS["tools-install"].run({ tool: "typst", yes: true }); console.log("installed"); }
      catch (e) { console.log(e.message); }`;
    const proc = Bun.spawnSync([process.execPath, "-e", script], {
      env: { ...process.env, JOB_SEARCH_HOME: ws, JOB_SEARCH_TELEMETRY: "0" },
    });
    expect(proc.stdout.toString()).toMatch(/checksum mismatch .*nothing was installed/);
    const bin = join(ws, "data", "tools", "bin");
    expect(existsSync(join(bin, "typst"))).toBe(false);
    expect(readdirSync(bin)).toEqual([]); // the .download- work dir is removed too
  });
});
