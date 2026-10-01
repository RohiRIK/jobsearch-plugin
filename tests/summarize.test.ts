import { describe, expect, test } from "bun:test";
import { summarizeText } from "../scripts/jobs/summarize.js";

describe("summarizeText", () => {
  test("extracts skills, years, languages, remote mode", () => {
    const jd = `Senior DevOps Engineer
Requirements:
- 3+ years with Docker, Kubernetes, Terraform
- Python and Bash scripting
- Hebrew and English
Nice to have:
- Azure experience
Hybrid position in Tel Aviv.`;
    const result = summarizeText(jd);
    expect(result.yearsExperience).toBe(3);
    expect(result.requiredSkills).toContain("docker");
    expect(result.requiredSkills).toContain("kubernetes");
    expect(result.niceToHaveSkills).toContain("azure");
    expect(result.languages).toEqual(expect.arrayContaining(["english", "hebrew"]));
    expect(result.remote).toBe("hybrid");
  });

  test("handles empty text gracefully", () => {
    const result = summarizeText("nothing relevant here");
    expect(result.requiredSkills).toEqual([]);
    expect(result.yearsExperience).toBeNull();
    expect(result.remote).toBe("unknown");
  });

  test("applies overrides", () => {
    const result = summarizeText("some job", { title: "Engineer", company: "Acme" });
    expect(result.title).toBe("Engineer");
    expect(result.company).toBe("Acme");
  });

  test("detects remote roles", () => {
    expect(summarizeText("This is a fully remote position").remote).toBe("remote");
  });

  test("extracts an explicitly stated five-day office requirement", () => {
    const result = summarizeText("This role requires employees to be in the office 5 days per week.");
    expect(result.remote).toBe("onsite");
    expect(result.officeDaysPerWeek).toBe(5);
  });

  test("infers location from a LinkedIn-style heading", () => {
    const result = summarizeText("Cloud Security Engineer\nExample Corp · Berlin, Germany\nHybrid role");
    expect(result.company).toBe("Example Corp");
    expect(result.location).toBe("Berlin, Germany");
  });

  test("extracts Dutch and an explicit current-residency requirement", () => {
    const result = summarizeText("Fluency in Dutch and English is required. Candidates must currently reside in US Central Time.");
    expect(result.languages).toEqual(expect.arrayContaining(["dutch", "english"]));
    expect(result.residencyRequirement).toBe("US Central Time");
  });

  test("does not turn a language-learning benefit into a language requirement", () => {
    const result = summarizeText("What you'll bring\n- Cloud security experience\nWhat we offer\n- A German language learning budget");
    expect(result.languages).toEqual([]);
    expect(result.niceToHaveLanguages).toEqual([]);
  });

  test("keeps an explicit preferred language separate from a required one", () => {
    const result = summarizeText("Requirements:\n- Fluency in English is strictly required. German proficiency is a plus.");
    expect(result.languages).toEqual(["english"]);
    expect(result.niceToHaveLanguages).toEqual(["german"]);
  });

  test("does not mistake the SWIFT banking network for the Swift programming language", () => {
    expect(summarizeText("Controls must align with DORA, SWIFT, and NIS2 requirements.").requiredSkills).not.toContain("swift");
    expect(summarizeText("Experience building iOS applications in Swift is required.").requiredSkills).toContain("swift");
  });

  test("word-boundary matching avoids substring false positives", () => {
    const result = summarizeText("We use the Golang toolchain");
    expect(result.requiredSkills).not.toContain("go");
  });
});
