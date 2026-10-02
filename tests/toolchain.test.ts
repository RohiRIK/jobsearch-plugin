import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TYPST_VERSION, typstRelease } from "../src/jobsearch/toolchain.js";

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

  test("refuses without --yes and previews the URL and workspace path with --dry-run", () => {
    expect(js(["tools-install"]).out.error.type).toBe("confirmation_required");
    const preview = js(["tools-install", "--dry-run"]);
    expect(preview.code).toBe(10);
    expect(preview.out.data.path).toBe(join(ws, "data", "tools", "bin", "typst"));
  });

  test("a binary in the workspace tools dir is found without any PATH change", () => {
    // JOB_SEARCH_BIN_PATH="" disables the test seam, so this is production discovery.
    const bin = join(ws, "data", "tools", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "typst"), "#!/bin/sh\necho typst 0.13.1\n", { mode: 0o755 });
    const proc = Bun.spawnSync([process.execPath, "-e", `import { resolveBin } from "${join(ROOT, "src/resolve-bin.ts")}"; console.log(resolveBin("typst"))`], {
      env: { ...process.env, JOB_SEARCH_HOME: ws, PATH: "/nonexistent" },
    });
    expect(proc.stdout.toString().trim()).toBe(join(bin, "typst"));
  });
});
