import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Profile } from "../src/profile-schemas.js";

const ROOT = resolve(import.meta.dir, "..");

async function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, "run", join(ROOT, "scripts/profile/scaffold.ts"), ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}

describe("profile scaffold", () => {
  test("the committed example is a schema-valid profile with placeholder-only data", () => {
    const example = Profile.parse(JSON.parse(readFileSync(join(ROOT, "data/profile.json.example"), "utf-8")));
    expect(example.identity.email).toBe("candidate@example.com");
    expect(example.experience).toEqual([]);
    expect(example.projects).toEqual([]);
  });

  test("creates a gitignored profile only when the destination does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "profile-scaffold-"));
    const output = join(dir, "profile.json");
    try {
      const created = await run(["--output", output]);
      expect(created.code).toBe(0);
      expect(JSON.parse(created.stdout).created).toBe(output);
      expect(Profile.safeParse(JSON.parse(readFileSync(output, "utf-8"))).success).toBe(true);

      const refused = await run(["--output", output]);
      expect(refused.code).toBe(1);
      expect(refused.stderr).toContain("OUTPUT_EXISTS");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("validates an existing profile without writing it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "profile-check-"));
    const output = join(dir, "profile.json");
    try {
      expect((await run(["--output", output])).code).toBe(0);
      const checked = await run(["--check", "--output", output]);
      expect(checked.code).toBe(0);
      expect(JSON.parse(checked.stdout).valid).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
