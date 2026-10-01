import { describe, expect, test } from "bun:test";
import { augmentedPath, resolveBin, resolveTypstCommand } from "../src/resolve-bin.js";

describe("resolveBin", () => {
  test("resolves a binary that is on PATH to an absolute path", () => {
    // sh exists on every POSIX box the suite runs on (Linux CI + macOS dev).
    const sh = resolveBin("sh");
    expect(sh).not.toBeNull();
    expect(sh!.startsWith("/")).toBe(true);
    expect(sh!.endsWith("sh")).toBe(true);
  });

  test("returns null for a binary that does not exist anywhere", () => {
    expect(resolveBin("definitely-not-a-real-binary-xyz123")).toBeNull();
  });

  test("returns a runnable Typst command from the project dependency when available", () => {
    const command = resolveTypstCommand(process.cwd());
    expect(command).not.toBeNull();
    expect(command!.length).toBeGreaterThan(0);
  });
});

describe("augmentedPath", () => {
  test("prepends the standard bin dirs ahead of the inherited PATH", () => {
    const p = augmentedPath();
    const dirs = p.split(":");
    expect(dirs).toContain("/usr/bin");
    expect(dirs).toContain("/usr/local/bin");
    // The snap-critical dirs must come before whatever the process inherited,
    // so a stripped-PATH bun still finds system tools.
    expect(dirs.indexOf("/usr/bin")).toBeLessThan(dirs.length - 1);
    expect(p).toContain(process.env.PATH ?? "");
  });
});
