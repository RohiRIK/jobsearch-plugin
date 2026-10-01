import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isCheckout, typstRoot, workspaceRoot } from "../src/paths.js";

const ROOT = resolve(import.meta.dir, "..");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("path rules", () => {
  // A bundled build moves the code; `import.meta.dir` math then points at a
  // directory that silently does not exist (the bundled triage once returned
  // templates.cv: null with no warning). src/paths.ts is the only exception.
  test("no module outside src/paths.ts does import.meta.dir path math", () => {
    const offenders = [...tsFiles(join(ROOT, "src")), ...tsFiles(join(ROOT, "scripts"))]
      .filter((f) => !f.endsWith(join("src", "paths.ts")))
      .filter((f) => readFileSync(f, "utf-8").includes("import.meta.dir"));
    expect(offenders.map((f) => f.replace(ROOT + "/", ""))).toEqual([]);
  });
});

describe("workspace resolution", () => {
  const fakeCheckout = () => {
    const dir = mkdtempSync(join(tmpdir(), "paths-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "ai-job-search" }));
    return dir;
  };

  test("JOB_SEARCH_HOME wins", () => {
    expect(workspaceRoot({ JOB_SEARCH_HOME: "/tmp/somewhere" }, "/opt/plugin")).toBe("/tmp/somewhere");
  });

  test("a checkout is its own workspace (unchanged behaviour)", () => {
    const checkout = fakeCheckout();
    expect(isCheckout(checkout)).toBe(true);
    expect(workspaceRoot({}, checkout)).toBe(checkout);
  });

  test("the plugin directory inside a checkout uses the checkout", () => {
    const checkout = fakeCheckout();
    mkdirSync(join(checkout, "job-search"));
    expect(workspaceRoot({}, join(checkout, "job-search"))).toBe(checkout);
  });

  test("an installed plugin falls back to XDG data, never the plugin dir", () => {
    expect(workspaceRoot({ XDG_DATA_HOME: "/x/share" }, "/home/u/.claude/plugins/cache/job-search")).toBe("/x/share/job-search");
  });

  test("an unrelated package.json is not mistaken for a checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "paths-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "something-else" }));
    expect(isCheckout(dir)).toBe(false);
  });

  test("typstRoot is the closest common ancestor of code and workspace", () => {
    expect(typstRoot("/home/u/.claude/plugins/cache/js", "/home/u/.local/share/job-search")).toBe("/home/u");
    expect(typstRoot("/repo", "/repo")).toBe("/repo");
    expect(typstRoot("/a/b", "/c/d")).toBe("/");
  });
});
