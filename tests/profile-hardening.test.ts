import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

async function run(script: string, args: string[], cwd = ROOT, env = process.env): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, "run", join(ROOT, script), ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd,
    env,
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}

describe("profile hardening", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "profile-hardening-"));
  });

  afterAll(() => {
    if (process.env.KEEP_PROFILE_HARDENING_OUTPUT !== "1") rmSync(dir, { recursive: true, force: true });
  });

  test("profile recovery snapshots have the same Git privacy boundary as the master", () => {
    for (const path of ["data/profile.json.backup", "data/profile.json.backup-2026-synthetic-uuid"]) {
      const result = Bun.spawnSync(["git", "check-ignore", "--no-index", "--quiet", path], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode, path).toBe(0);
    }
  });

  // Test 1: maxOfficeDaysPerWeek absent remains unknown; no 0 invented
  test("score-job treats absent maxOfficeDaysPerWeek as unknown, not 0, for on-site eligibility", async () => {
    const profilePath = join(dir, "profile-no-max-office.json");
    const profile = {
      identity: { name: "Test", email: "test@example.com", phone: "+1 555 0100", location: "Remote" },
      workPreferences: { remote: true, hybrid: true, relocation: true }, // NO maxOfficeDaysPerWeek
      experience: [{ title: "Engineer", company: "Acme", startDate: "2020", endDate: "Present" }],
      skills: [{ category: "Backend", skills: ["Python"] }],
    };
    writeFileSync(profilePath, JSON.stringify(profile));

    const jobPath = join(dir, "job.txt");
    writeFileSync(jobPath, "Senior Engineer. Requirements: Python. On-site 5 days/week.");

    const { code, stdout, stderr } = await run("scripts/match/score-job.ts", ["--input", jobPath, "--profile", profilePath]);
    const result = JSON.parse(stdout);

    // When maxOfficeDaysPerWeek is absent, the eligibility should be "review" with constraint "profile states no maximum"
    expect(result.eligibility.status).toBe("review");
    expect(result.eligibility.constraints.join(" ")).toContain("profile states no maximum");
    expect(result.eligibility.constraints.join(" ")).not.toContain("deal-breaker"); // Should NOT treat absent as 0 (which would be deal-breaker)
    expect(code).toBe(0);
  });

  describe("build-profile overwrite guard", () => {
    let testDir: string;
    let profilePath: string;

    beforeAll(() => {
      testDir = mkdtempSync(join(tmpdir(), "build-profile-guard-"));
      // Use WORKSPACE=testDir so all path operations resolve under testDir
      profilePath = join(testDir, "data", "profile.json");
      mkdirSync(join(testDir, "data"), { recursive: true });
      mkdirSync(join(testDir, "data", "staging"), { recursive: true });
      const originalProfile = {
        identity: { name: "Original", email: "original@example.com" },
        experience: [{ title: "Engineer", company: "Acme", startDate: "2020", achievements: ["Sentinel fact: 42 services"] }],
        skills: [{ category: "Backend", skills: ["Python"] }],
      };
      writeFileSync(profilePath, JSON.stringify(originalProfile, null, 2));
    });

    afterAll(() => {
      if (process.env.KEEP_PROFILE_HARDENING_OUTPUT !== "1") rmSync(testDir, { recursive: true, force: true });
    });

    test("refuses overwrite without --replace when profile exists and merge would change it", async () => {
      // No JOB_SEARCH_HOME env; paths resolve from cwd (project root).
      // Since we run from testDir, merge etc. all write under testDir/data/profile.json.
      const env = { ...process.env, JOB_SEARCH_HOME: testDir };

      const stagingPath = join(testDir, "data", "staging", "manual.json");
      writeFileSync(stagingPath, JSON.stringify({
        identity: { name: "Overwritten", email: "overwritten@example.com" },
        experience: [{ title: "New", company: "Different", startDate: "2022" }],
        skills: [{ category: "Frontend", skills: ["React"] }],
      }));

      // Run build-profile WITHOUT --replace (should refuse because profile exists)
      const { code, stdout, stderr } = await run("scripts/profile/build-profile.ts", [], testDir, env);

      // Should refuse overwrite
      expect(code).not.toBe(0);
      expect(stderr).toContain("exists");
      // The original profile.json should remain unchanged
      const after = JSON.parse(readFileSync(profilePath, "utf-8"));
      expect(after.identity.name).toBe("Original");
      expect(after.experience[0].achievements[0]).toContain("Sentinel fact: 42 services");
    });

    test("with --replace overwrites and creates backup of original", async () => {
      const env = { ...process.env, JOB_SEARCH_HOME: testDir };

      // Create staging (manual.json) for merge
      const stagingPath = join(testDir, "data", "staging", "manual.json");
      writeFileSync(stagingPath, JSON.stringify({
        identity: { name: "Overwritten", email: "overwritten@example.com" },
        experience: [{ title: "New", company: "Different", startDate: "2022" }],
        skills: [{ category: "Frontend", skills: ["React"] }],
      }));

      // Skip fetch/sync steps that need external inputs; we only need merge
      const { code, stdout, stderr } = await run("scripts/profile/build-profile.ts", ["--replace", "--skip-github", "--skip-blog", "--skip-sync"], testDir, env);

      // Should succeed with --replace
      expect(code).toBe(0);
      const after = JSON.parse(readFileSync(profilePath, "utf-8"));
      expect(after.identity.name).toBe("Overwritten");

      // Backup should exist
      const backupPath = profilePath + ".backup";
      expect(existsSync(backupPath)).toBe(true);
      const backup = JSON.parse(readFileSync(backupPath, "utf-8"));
      expect(backup.identity.name).toBe("Original");
      expect(backup.experience[0].achievements[0]).toContain("Sentinel fact: 42 services");
    });

    test("with --backup flag but without --replace creates backup but refuses overwrite", async () => {
      // Reset profile to original first
      const originalProfile = {
        identity: { name: "Original", email: "original@example.com" },
        experience: [{ title: "Engineer", company: "Acme", startDate: "2020", achievements: ["Sentinel fact: 42 services"] }],
        skills: [{ category: "Backend", skills: ["Python"] }],
      };
      writeFileSync(profilePath, JSON.stringify(originalProfile, null, 2));

      const env = { ...process.env, JOB_SEARCH_HOME: testDir };
      const { code, stdout, stderr } = await run("scripts/profile/build-profile.ts", ["--backup"], testDir, env);

      // Should refuse overwrite (without --replace) but create backup
      expect(code).not.toBe(0);
      expect(existsSync(profilePath + ".backup")).toBe(true);
      const profile = JSON.parse(readFileSync(profilePath, "utf-8"));
      expect(profile.identity.name).toBe("Original");
    });
  });

  test("repeated backup requests retain the first recovery snapshot and each newer snapshot", async () => {
    const home = mkdtempSync(join(tmpdir(), "profile-backup-retention-"));
    try {
      mkdirSync(join(home, "data"));
      const path = join(home, "data/profile.json"), first = JSON.stringify({ identity: { name: "First approved facts" } }), second = JSON.stringify({ identity: { name: "Second approved facts" } });
      const env = { ...process.env, JOB_SEARCH_HOME: home };
      writeFileSync(path, first);
      await run("scripts/profile/build-profile.ts", ["--backup"], home, env);
      writeFileSync(path, second);
      await run("scripts/profile/build-profile.ts", ["--backup"], home, env);
      expect(readFileSync(path + ".backup", "utf8")).toBe(first);
      const snapshots = readdirSync(join(home, "data")).filter(name => name.startsWith("profile.json.backup-"));
      expect(snapshots).toHaveLength(2);
      expect(snapshots.map(name => readFileSync(join(home, "data", name), "utf8"))).toContain(second);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  // Test 3: sync-claude preserves CLAUDE.md sections outside Candidate Profile
  test("sync-claude only replaces Candidate Profile section, preserves rest", async () => {
    const testDir = mkdtempSync(join(tmpdir(), "sync-claude-"));
    try {
      const profilePath = join(testDir, "profile.json");
      const claudePath = join(testDir, "CLAUDE.md");

      writeFileSync(profilePath, JSON.stringify({
        identity: { name: "Test Candidate", email: "test@example.com", location: "Remote", linkedin: "https://linkedin.com/in/test" },
        workPreferences: { remote: true, hybrid: true, relocation: true },
        experience: [{ title: "Engineer", company: "Acme", startDate: "2020" }],
      }));

      writeFileSync(claudePath, "# My CLAUDE\n\n## Candidate Profile\nold content\n\n## Entry Point\npreserved content\n");

      const { code, stdout, stderr } = await run("scripts/profile/sync-claude.ts", ["--profile", profilePath, "--claude", claudePath]);

      expect(code).toBe(0);
      const rendered = readFileSync(claudePath, "utf-8");
      expect(rendered).toContain("## Candidate Profile");
      expect(rendered).toContain("### Identity");
      expect(rendered).toContain("Test Candidate");
      expect(rendered).toContain("## Entry Point");
      expect(rendered).toContain("preserved content");
      expect(rendered).not.toContain("old content");
    } finally {
      if (process.env.KEEP_PROFILE_HARDENING_OUTPUT !== "1") rmSync(testDir, { recursive: true, force: true });
    }
  });
});