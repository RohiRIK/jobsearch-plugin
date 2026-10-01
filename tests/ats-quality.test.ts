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
