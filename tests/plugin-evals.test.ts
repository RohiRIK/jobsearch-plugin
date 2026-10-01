import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const EVALS = resolve(import.meta.dir, "..", "job-search", "evals");
const cases = readdirSync(EVALS).filter((d) => existsSync(join(EVALS, d, "prompt.md")));
const fm = (text: string) => text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

describe("plugin eval suite", () => {
  test("has the cases the efficiency report relies on", () => {
    expect(cases.sort()).toEqual(["manage-health", "not-a-job-request", "prepare-brief", "rank-saved-postings", "triage-one-posting", "where-is-my-data"]);
  });

  for (const c of cases) {
    describe(c, () => {
      const prompt = readFileSync(join(EVALS, c, "prompt.md"), "utf-8");
      test("prompt frontmatter uses only documented keys", () => {
        const allowed = new Set(["schema_version", "name", "description", "tags", "plugins", "runs", "expected_outcome", "model", "max_turns", "timeout_seconds", "allowed_tools", "append_system_prompt", "env"]);
        for (const line of fm(prompt).split("\n")) expect(allowed.has(line.split(":")[0])).toBe(true);
      });

      test("has at least one grader, each with a type and a regex that compiles", () => {
        const graders = readdirSync(join(EVALS, c, "graders"));
        expect(graders.length).toBeGreaterThan(0);
        for (const g of graders) {
          const head = fm(readFileSync(join(EVALS, c, "graders", g), "utf-8"));
          expect(head).toMatch(/^type: (regex|tool_used|tool_order|file_exists|llm|baseline)$/m);
          for (const m of head.matchAll(/^(?:input_match|pattern): ['"](.*)['"]$/gm)) {
            // YAML single/double quotes: \s must stay a regex escape, not a literal backslash.
            expect(m[1]).not.toContain("\\\\s");
            expect(m[1]).not.toMatch(/^\(\?[a-z]+\)/); // inline flags are unsupported; use `flags:`
            expect(() => new RegExp(m[1])).not.toThrow();
          }
        }
      });

      test("a seeded case embeds exactly the shared example profile", () => {
        const seed = join(EVALS, c, "seed.sh");
        if (!existsSync(seed)) return;
        const profile = readFileSync(join(EVALS, "fixtures", "profile.json"), "utf-8").trimEnd();
        expect(readFileSync(seed, "utf-8")).toContain(`<<'PROFILE'\n${profile}\nPROFILE`);
        expect(readFileSync(join(EVALS, c, "case.yaml"), "utf-8")).toContain("scaffold_script: seed.sh");
      });
    });
  }

  test("the grader for tool paths matches the real launcher invocation", () => {
    const input = JSON.stringify({ command: '"/x/job-search/1.1.0/scripts/jobsearch" triage --job /tmp/p.txt' });
    expect(new RegExp('jobsearch(?:\\\\?")?\\s+triage').test(input)).toBe(true);
    expect(new RegExp('jobsearch(?:\\\\?")?\\s+triage').test(JSON.stringify({ command: "jobsearch triage --job p.txt" }))).toBe(true);
    const skill = JSON.stringify({ skill: "job-search:research" });
    expect(new RegExp('"skill"\\s*:\\s*"(?:[\\w-]+:)?(?:research|cv)"').test(skill)).toBe(true);
  });
});
