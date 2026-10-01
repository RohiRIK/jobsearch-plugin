import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

async function pipe(script: string, input: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, "run", join(ROOT, script)], {
    stdin: new Response(input).body,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}

// Guards the snap-EPERM fix (src/stdin.ts reads process.stdin, not Bun.stdin).
// If someone reverts to Bun.stdin these break under snap-packaged bun.
describe("readStdin via summarize", () => {
  test("piped job text is parsed into structured skills", async () => {
    const { code, stdout } = await pipe(
      "scripts/jobs/summarize.ts",
      "Senior DevOps Engineer. Requirements: Python, Azure, Kubernetes. 5+ years."
    );
    expect(code).toBe(0);
    const jd = JSON.parse(stdout);
    expect(jd.requiredSkills).toContain("python");
    expect(jd.requiredSkills).toContain("azure");
  });
});

describe("readStdin via score-job", () => {
  test("piped text is scored, or reports the missing profile honestly", async () => {
    const { stdout, stderr } = await pipe(
      "scripts/match/score-job.ts",
      "DevOps role. Requirements: PowerShell, Python. 3+ years."
    );
    // The stdin read is the thing under test. With a profile (local) stdout is
    // a score; without one (CI, profile is gitignored) the honest NO_PROFILE
    // error goes to stderr and stdout is empty — both prove stdin was consumed.
    if (stdout.trim()) {
      expect(typeof JSON.parse(stdout).score).toBe("number");
    } else {
      expect(stderr).toMatch(/profile/i);
    }
  });
});
