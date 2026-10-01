import { describe, expect, test } from "bun:test";
import { scoreJob } from "../scripts/match/score-job.js";
import { summarizeText } from "../scripts/jobs/summarize.js";
import type { Profile } from "../src/profile-schemas.js";

const profile: Profile = {
  identity: { name: "Test User", location: "Tel Aviv", country: "Israel", languages: ["Hebrew", "English"] },
  skills: [{ category: "DevOps", skills: ["Docker", "Kubernetes", "Python", "Bash"] }],
  experience: [{ title: "Engineer", company: "Acme", startDate: "2020-01", endDate: "2025-01" }],
};

describe("scoreJob", () => {
  test("high match scores high", () => {
    const jd = summarizeText("Requirements: 3+ years Docker, Kubernetes, Python. Hebrew and English. Remote position.");
    const result = scoreJob(jd, profile);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.breakdown.experience).toBe(25);
    expect(result.breakdown.location).toBe(10);
    expect(result.breakdown.language).toBe(10);
  });

  test("missing skills produce gaps", () => {
    const jd = summarizeText("Requirements: Rust and Scala, 10+ years");
    const result = scoreJob(jd, profile);
    expect(result.gaps).toContain("rust");
    expect(result.gaps).toContain("scala");
    expect(result.score).toBeLessThan(50);
  });

  test("empty JD scores neutral, never crashes", () => {
    const jd = summarizeText("vague text with no signals");
    const result = scoreJob(jd, profile);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.neutral.length).toBeGreaterThan(0);
  });

  test("empty profile scores neutral without crashing", () => {
    const jd = summarizeText("Requirements: Docker, 5+ years, Hebrew");
    const result = scoreJob(jd, { identity: { languages: [] } });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test("score is bounded 0-100", () => {
    const jd = summarizeText("Docker Kubernetes Python Bash Hebrew English remote 1+ years");
    const result = scoreJob(jd, profile);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test("keeps capability evidence but marks an explicit five-day office role ineligible", () => {
    const constrainedProfile: Profile = {
      ...profile,
      workPreferences: { remote: true, hybrid: true, relocation: true, maxOfficeDaysPerWeek: 4 },
    };
    const result = scoreJob(
      summarizeText("Requirements: Docker. This role requires employees to be in the office 5 days per week."),
      constrainedProfile,
    );

    expect(result.matched).toContain("docker");
    expect(result.breakdown.skills).toBe(36);
    expect(result.eligibility.status).toBe("ineligible");
    expect(result.eligibility.constraints.join(" ")).toContain("5 office days/week");
    expect(result.breakdown.location).toBe(0);
  });

  test("marks an on-site role with unknown office-day count for review", () => {
    const constrainedProfile: Profile = {
      ...profile,
      workPreferences: { remote: true, hybrid: true, relocation: true, maxOfficeDaysPerWeek: 4 },
    };
    const result = scoreJob(summarizeText("Requirements: Docker. On-site role in Berlin."), constrainedProfile);

    expect(result.eligibility.status).toBe("review");
    expect(result.eligibility.constraints.join(" ")).toContain("office-day count");
  });

  test("scores accepted hybrid and relocation cases without a deal-breaker", () => {
    const constrainedProfile: Profile = {
      ...profile,
      workPreferences: { remote: true, hybrid: true, relocation: true, maxOfficeDaysPerWeek: 4 },
    };
    const hybrid = scoreJob(summarizeText("Requirements: Docker. Hybrid role."), constrainedProfile);
    const relocation = scoreJob(
      summarizeText("Requirements: Docker. On-site 3 days per week.", { location: "Berlin" }),
      constrainedProfile,
    );

    expect(hybrid.eligibility.status).toBe("eligible");
    expect(hybrid.breakdown.location).toBe(8);
    expect(relocation.eligibility.status).toBe("eligible");
    expect(relocation.breakdown.location).toBe(6);
    expect(relocation.matched).toContain("relocation considered: Berlin");
  });

  test("marks an explicit current-residency requirement for review", () => {
    const constrainedProfile: Profile = {
      ...profile,
      workPreferences: { remote: true, hybrid: true, relocation: true, maxOfficeDaysPerWeek: 4 },
    };
    const result = scoreJob(
      summarizeText("Requirements: Docker. Candidates must currently reside in US Central Time."),
      constrainedProfile,
    );

    expect(result.eligibility.status).toBe("review");
    expect(result.eligibility.constraints.join(" ")).toContain("US Central Time");
  });

  test("matches explicit identity protocols but keeps an unsupported identity product as a gap", () => {
    const identityProfile: Profile = {
      identity: { name: "Test User" },
      skills: [{ category: "Identity", skills: ["SAML 2.0 federation", "Automated provisioning via SCIM"] }],
    };
    const result = scoreJob(summarizeText("Requirements: Okta, SAML, SCIM"), identityProfile);

    expect(result.matched).toEqual(expect.arrayContaining(["saml", "scim"]));
    expect(result.gaps).toContain("okta");
  });

  test("recognizes Cloud SIEM and plural Solutions Engineer titles as target sectors", () => {
    const sectorProfile: Profile = {
      identity: { name: "Test User" },
      targetSectors: [
        { sector: "Cloud Security", companies: [] },
        { sector: "Solution Engineer", companies: [] },
      ],
    };
    const cloudSiem = scoreJob(summarizeText("Requirements: security", { title: "Senior Security Engineer - Cloud SIEM" }), sectorProfile);
    const solutions = scoreJob(summarizeText("Requirements: security", { title: "Solutions Engineer, Benelux" }), sectorProfile);

    expect(cloudSiem.breakdown.sector).toBe(15);
    expect(solutions.breakdown.sector).toBe(15);
  });

  test("does not mistake Google Cloud Platform for Go", () => {
    const cloudProfile: Profile = {
      identity: { name: "Test User" },
      skills: [{ category: "Cloud Platforms", skills: ["Google Cloud Platform (GCP)"] }],
    };
    const result = scoreJob(summarizeText("Requirements: Go"), cloudProfile);

    expect(result.matched).not.toContain("go");
    expect(result.gaps).toContain("go");
  });

  test("matches explicit Entra ID and Azure AD aliases", () => {
    const identityProfile: Profile = {
      identity: { name: "Test User" },
      skills: [{ category: "Identity", skills: ["Entra ID"] }],
    };
    const result = scoreJob(summarizeText("Requirements: Azure AD"), identityProfile);

    expect(result.matched).toContain("azure ad");
    expect(result.gaps).not.toContain("azure ad");
    expect(result.skillEvidence).toContainEqual({
      requirement: "azure ad",
      profileSkill: "Entra ID",
      matchType: "alias",
    });
  });

  test("matches Microsoft 365 and M365 aliases", () => {
    const m365Profile: Profile = {
      identity: { name: "Test User" },
      skills: [{ category: "Productivity", skills: ["Microsoft 365"] }],
    };
    const result = scoreJob(summarizeText("Requirements: M365"), m365Profile);

    expect(result.matched).toContain("m365");
    expect(result.skillEvidence).toContainEqual({
      requirement: "m365",
      profileSkill: "Microsoft 365",
      matchType: "alias",
    });
  });

  test("matches Solution Engineering automation capabilities independently", () => {
    const automationProfile: Profile = {
      identity: { name: "Test User" },
      skills: [{
        category: "Solution Engineering & Automation",
        skills: ["Azure Automation", "Power Apps", "n8n", "Jenkins", "Zapier", "Python automation", "Bash automation"],
      }],
    };

    for (const [requirement, profileSkill] of [
      ["azure automation", "Azure Automation"],
      ["power apps", "Power Apps"],
      ["n8n", "n8n"],
      ["jenkins", "Jenkins"],
      ["zapier", "Zapier"],
      ["python", "Python automation"],
      ["bash", "Bash automation"],
    ]) {
      const result = scoreJob(summarizeText(`Solution Engineer requirements: ${requirement}`), automationProfile);
      expect(result.gaps).not.toContain(requirement);
      expect(result.skillEvidence).toContainEqual({ requirement, profileSkill, matchType: "exact" });
    }
  });

  test("does not score rapid-ramp-up adjacent tools as established experience", () => {
    const profileWithAdjacentTool: Profile = {
      identity: { name: "Test User" },
      adjacentSkills: [{
        category: "Solution Engineering & Automation — rapid ramp-up (not claimed experience)",
        skills: ["GitHub Actions"],
      }],
    };
    const result = scoreJob(summarizeText("Solution Engineer requirements: GitHub Actions"), profileWithAdjacentTool);

    expect(result.matched).not.toContain("github actions");
    expect(result.gaps).toContain("github actions");
  });

  test("does not count military service as technical professional experience", () => {
    const profileWithService: Profile = {
      identity: { name: "Test User" },
      experience: [
        { title: "Engineer", company: "Acme", startDate: "2021", endDate: "2025", experienceType: "professional" },
        { title: "Squad Leader", company: "National Army", startDate: "2014", endDate: "2018", experienceType: "military-service" },
      ],
    };
    const result = scoreJob(summarizeText("Requirements: 6+ years"), profileWithService);

    expect(result.breakdown.experience).toBe(17);
    expect(result.gaps).toContain("experience: 4y < required 6y");
  });
});
