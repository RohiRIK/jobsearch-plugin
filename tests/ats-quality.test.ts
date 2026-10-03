import { describe, expect, test } from "bun:test";
import { checkAtsQuality } from "../scripts/verify-ats.js";

const contact = "candidate@example.com\n+1 555 010 0200";

describe("ATS quality checks", () => {
  test("makes a real line-structure assertion instead of a placeholder pass", () => {
    const checks = checkAtsQuality(`${contact}\nProfile\nBuilder\nSkills\nPython\nExperience\nEngineer`, true);
    expect(checks.map((check) => check.name)).toContain("Usable line structure");
    expect(checks.map((check) => check.name)).not.toContain("Text extraction clean");
    expect(checks.find((check) => check.name === "Usable line structure")?.pass).toBe(true);
  });

  test("detects extracted CV section interleaving", () => {
    const checks = checkAtsQuality(`${contact}\nExperience\nEngineer\nProfile\nBuilder`, true);
    const order = checks.find((check) => check.name === "CV section order");
    expect(order?.pass).toBe(false);
    expect(order?.detail).toContain("experience -> profile");
  });

  // German-speaking markets place education before work experience. Asserting a
  // single fixed order failed a correctly-ordered German CV.
  test("accepts an education-first CV", () => {
    const checks = checkAtsQuality(
      `${contact}\nProfile\nSummary\nSkills\nAzure\nEducation\nBSc\nCertifications\nMS-900\nExperience\nEngineer\nProjects\nA tool`,
      true,
    );
    expect(checks.find((check) => check.name === "CV section order")?.pass).toBe(true);
  });

  test("accepts an experience-first CV", () => {
    const checks = checkAtsQuality(
      `${contact}\nProfile\nSummary\nSkills\nAzure\nExperience\nEngineer\nProjects\nA tool\nEducation\nBSc\nCertifications\nMS-900`,
      true,
    );
    expect(checks.find((check) => check.name === "CV section order")?.pass).toBe(true);
  });

  // The point of accepting two orders is that it must still reject a third.
  test("still rejects an order that is neither convention", () => {
    const checks = checkAtsQuality(`${contact}\nSkills\nAzure\nProfile\nSummary\nExperience\nEngineer`, true);
    expect(checks.find((check) => check.name === "CV section order")?.pass).toBe(false);
  });

  test("fails unusably short extraction", () => {
    const checks = checkAtsQuality("candidate@example.com", false);
    expect(checks.find((check) => check.name === "Usable line structure")?.pass).toBe(false);
    expect(checks.find((check) => check.name === "Sufficient content")?.pass).toBe(false);
  });
});

// Owner E2E run (2026-10-02): the word "experience" in the summary was read as
// the Experience heading, failing a correctly ordered CV.
describe("CV section order reads headings, not prose", () => {
  const order = (text: string, expected?: string[]) =>
    checkAtsQuality(text, true, expected).find((check) => check.name === "CV section order");

  test("a heading word inside body prose is not a heading", () => {
    const cv = `${contact}\nProfile\nEngineer with experience in identity and education in security.\nSkills\nAzure\nExperience\nEngineer\nEducation\nBSc`;
    expect(order(cv)?.pass).toBe(true);
  });

  test("a genuinely interleaved extraction still fails", () => {
    expect(order(`${contact}\nExperience\nEngineer\nProfile\nBuilder with experience`)?.pass).toBe(false);
  });

  test("a CV is checked against the order its source declares", () => {
    const reversed = `${contact}\nCertifications\nMS-900\nEducation\nBSc\nExperience\nEngineer\nProfile\nBuilder`;
    expect(order(reversed)?.pass).toBe(false);
    expect(order(reversed, ["Certifications", "Education", "Projects", "Experience", "Profile", "Skills"])?.pass).toBe(true);
    // Declared order does not excuse an extraction that contradicts it.
    expect(order(reversed, ["Profile", "Skills", "Experience", "Projects", "Education", "Certifications"])?.pass).toBe(false);
  });

  test("project-first passes without a declared order", () => {
    expect(order(`${contact}\nProfile\nBuilder\nSkills\nAzure\nProjects\nA tool\nExperience\nEngineer\nEducation\nBSc`)?.pass).toBe(true);
  });
});
