import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { applicationProfile } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");

async function run(script: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, "run", join(ROOT, script), ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}

describe("followup default subcommand", () => {
  test("no argument defaults to pending, not a BAD_CMD error", async () => {
    const { code, stdout, stderr } = await run("scripts/followup.ts", []);
    expect(code).toBe(0);
    expect(stderr).not.toContain("BAD_CMD");
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("pending");
    expect(parsed).toHaveProperty("minDays");
  });

  test("an actually unknown subcommand still errors", async () => {
    const { code, stderr } = await run("scripts/followup.ts", ["bogus"]);
    expect(code).toBe(1);
    expect(stderr).toContain("BAD_CMD");
  });
});

describe("projects sync safety", () => {
  test("requires an explicit destructive flag before replacing curated projects", async () => {
    const { code, stderr } = await run("scripts/projects.ts", ["sync"]);
    expect(code).toBe(1);
    expect(stderr).toContain("replace-from-blog");
  });
});

describe("profile and feedback pipeline safety", () => {
  test("profile orchestration invokes the current scripts directory", () => {
    const source = readFileSync(join(ROOT, "scripts/profile/build-profile.ts"), "utf-8");
    expect(source).not.toContain("tools/profile/");
    expect(source).toContain("scripts/profile/fetch-github.ts");
    expect(source).toContain("scripts/profile/merge.ts");
  });

  test("reason pipeline never applies profile feedback implicitly", () => {
    const source = readFileSync(join(ROOT, "scripts/pipeline/cli.ts"), "utf-8");
    expect(source).not.toContain('["suggest", "--apply"]');
    expect(source).toContain('["suggest"]');
  });
});

describe("Hermes profile scoping", () => {
  test("supports global and explicit profile targets without hard-coding a profile", () => {
    const script = readFileSync(join(ROOT, ".agents/install/hermes.sh"), "utf-8");
    expect(script).toContain("--profile");
    expect(script).toContain("--dry-run");
    expect(script).toContain('--scope "profile:$2"');
    const hosts = readFileSync(join(ROOT, "src/jobsearch/hosts.ts"), "utf-8");
    expect(hosts).toContain('join(home(), ".hermes", "profiles", name)');
    // No Hermes profile name is ever hard-coded: the scope always comes from the caller.
    for (const source of [script, hosts]) expect(source).not.toMatch(/profiles\/[A-Za-z]/);
  });
});

describe("profile sync safety", () => {
  test("syncs through any following level-2 heading without copying contact data", async () => {
    const dir = mkdtempSync(join(tmpdir(), "profile-sync-"));
    const profilePath = join(dir, "profile.json");
    const claudePath = join(dir, "CLAUDE.md");
    try {
      writeFileSync(profilePath, JSON.stringify({
        identity: {
          name: "Test Candidate",
          email: "candidate@example.com",
          phone: "+1 202 555 0147",
          location: "Example City, Testland",
          country: "Testland",
          linkedin: "https://linkedin.com/in/placeholder",
          github: "https://github.com/test-candidate",
          blog: "https://example.test",
        },
        workPreferences: { remote: true, hybrid: true, relocation: true, maxOfficeDaysPerWeek: 4 },
      }));
      writeFileSync(claudePath, "# Test\n\n## Candidate Profile\nstale\n\n## Entry point\nPreserved content.\n");

      const { code, stdout, stderr } = await run("scripts/profile/sync-claude.ts", ["--profile", profilePath, "--claude", claudePath]);
      const rendered = readFileSync(claudePath, "utf-8");

      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(JSON.parse(stdout).output).toBe(claudePath);
      expect(rendered).toContain("### Work Preferences");
      expect(rendered).toContain("- **Location:** Example City, Testland");
      expect(rendered).not.toContain("Example City, Testland, Testland");
      expect(rendered).toContain("## Entry point\nPreserved content.");
      expect(rendered).not.toContain("candidate@example.com");
      expect(rendered).not.toContain("+1 202 555 0147");
      expect(rendered).not.toContain("linkedin.com/in/placeholder");
      expect(rendered).not.toContain("github.com/test-candidate");
      expect(rendered).not.toContain("https://example.test");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("reevaluate accepts .tex sources", () => {
  test("a .tex --file path is handled (reaches gates, not an extension crash)", async () => {
    // No such file exists → the exists gate fails, but the point is that a .tex
    // path is classified and evaluated rather than rejected on its extension.
    const { code, stdout } = await run("scripts/reevaluate.ts", ["--file", "assets/cv/Jane-Doe_NoSuch_Role_CV.tex"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.documents[0].docType).toBe("cv");
    expect(parsed.documents[0].gates[0].gate).toBe("exists");
    expect(code).toBe(1);
  });

  test("a _CL.tex path classifies as a cover letter", async () => {
    const { stdout } = await run("scripts/reevaluate.ts", ["--file", "assets/cover_letters/Jane-Doe_NoSuch_Role_CL.tex"]);
    expect(JSON.parse(stdout).documents[0].docType).toBe("cl");
  });

  test("CV page gate uses the selected market budget", async () => {
    const { stdout } = await run("scripts/reevaluate.ts", ["--file", "templates/cv/modern/template.typ", "--market", "us"]);
    const pageGate = JSON.parse(stdout).documents[0].gates.find((gate: { gate: string }) => gate.gate === "pages");
    expect(pageGate.detail).toContain("exactly 1 page(s) for United States");
  });

  test("rejects a filename whose identity disagrees with the active profile", async () => {
    const dir = mkdtempSync(join(tmpdir(), "identity-gate-"));
    const pdf = join(dir, "Jane_Doe_Company_Role_CV.pdf");
    const profile = join(dir, "profile.json");
    try {
      copyFileSync(join(ROOT, "tests/fixtures/one-page.pdf"), pdf);
      writeFileSync(profile, JSON.stringify(applicationProfile));
      const { stdout } = await run("scripts/reevaluate.ts", ["--file", pdf, "--profile", profile]);
      const naming = JSON.parse(stdout).documents[0].gates.find((gate: { gate: string }) => gate.gate === "naming");
      expect(naming.pass).toBe(false);
      expect(naming.detail).toContain("does not match profile identity");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("market CV page budget never applies to a one-page cover letter", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cover-page-gate-"));
    const file = join(dir, "Candidate_Company_Role_CL.pdf");
    try {
      copyFileSync(join(ROOT, "tests/fixtures/one-page.pdf"), file);
      const { stdout } = await run("scripts/reevaluate.ts", ["--file", file, "--market", "de"]);
      const report = JSON.parse(stdout).documents[0];
      const pageGate = report.gates.find((gate: { gate: string }) => gate.gate === "pages");
      expect(report.docType).toBe("cl");
      expect(pageGate.pass).toBe(true);
      expect(pageGate.detail).toContain("exactly 1 page(s)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
