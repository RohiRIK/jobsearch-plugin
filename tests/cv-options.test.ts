import { describe, expect, test } from "bun:test";
import { CV_LAYOUTS, recommendCvLayout } from "../src/cv-options.js";

describe("CV layout catalog", () => {
  test("contains ten concrete layout options", () => {
    expect(CV_LAYOUTS).toHaveLength(10);
    expect(new Set(CV_LAYOUTS.map((option) => option.id)).size).toBe(10);
  });

  test("recommends a technical layout for a technical engineering role", () => {
    const result = recommendCvLayout({
      role: "Platform Engineer",
      market: "us",
      posting: "Build cloud infrastructure, Docker, CI/CD and Python automation for a platform team.",
    });
    expect(["technical", "ats-compact"]).toContain(result.recommended);
    expect(result.options.length).toBe(5);
    expect(result.options[0].reasons.length).toBeGreaterThan(0);
    expect(CV_LAYOUTS.find((option) => option.id === result.recommended)?.supportsAvatar).toBe(true);
  });

  test("shifts toward ATS compact for an ATS-heavy market", () => {
    const result = recommendCvLayout({
      role: "Cloud Security Engineer",
      market: "us",
      posting: "ATS-friendly cloud security, SIEM, Python and infrastructure role.",
    });
    expect(result.options.map((option) => option.id)).toContain("ats-compact");
  });
});
