import { describe, expect, test } from "bun:test";
import { buildEmail } from "../scripts/generate/email.js";
import { draftParagraphs, renderTyp } from "../scripts/generate/cover-letter.js";
import { buildPrepSheet } from "../scripts/jobs/interview-prep.js";
import type { Profile } from "../src/profile-schemas.js";

const profile = {
  identity: { name: "Test Person", github: "https://github.com/test" },
  skills: [{ category: "Langs", skills: ["PowerShell", "Python", "TypeScript"] }],
  experience: [],
  education: [],
} as unknown as Profile;

describe("buildEmail", () => {
  const ctx = { company: "Acme", role: "Engineer", contact: "Dana", senderName: "Test Person" };

  test("all four types produce subject and body with context", () => {
    for (const type of ["followup", "thank-you", "withdraw", "referral"] as const) {
      const email = buildEmail(type, ctx);
      expect(email.subject.length).toBeGreaterThan(5);
      expect(email.body).toContain("Acme");
      expect(email.body).toContain("Test Person");
    }
  });

  test("followup mentions days since applying when known", () => {
    const email = buildEmail("followup", { ...ctx, appliedDate: "2026-07-01", daysSinceApplied: 10 });
    expect(email.body).toContain("10 days ago");
  });
});

describe("draftParagraphs", () => {
  test("without posting: skills-based draft, no fabricated match data", () => {
    const d = draftParagraphs({ profile, company: "Acme", role: "Engineer", posting: null });
    expect(d.paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(d.matched).toEqual([]);
    expect(d.gaps).toEqual([]);
    expect(d.paragraphs.join(" ")).toContain("Acme");
    expect([...d.paragraphs, ...d.bullets].join(" ")).not.toMatch(
      /measurable outcomes|production environments|current work|immediate impact|delivered end-to-end|builder mindset/i,
    );
  });

  test("with posting: matched and gaps reflect the posting honestly", () => {
    const d = draftParagraphs({
      profile,
      company: "Acme",
      role: "Engineer",
      posting: "Requirements: Python, PowerShell, Kubernetes, Terraform.",
    });
    expect(d.matched).toContain("python");
    expect(d.gaps).toContain("kubernetes");
    expect(d.bullets).toEqual([]);
    expect(d.paragraphs.join(" ")).toContain("Python and PowerShell");
    expect(d.paragraphs.join(" ")).not.toContain("—");
  });

  test("selects the latest role and uses achievements when responsibilities are empty", () => {
    const experienceProfile = {
      ...profile,
      experience: [
        {
          title: "Older Engineer",
          company: "OldCo",
          startDate: "2018",
          endDate: "2020",
          responsibilities: ["Maintained legacy systems"],
        },
        {
          title: "Platform Engineer",
          company: "NewCo",
          startDate: "2023",
          endDate: "Present",
          responsibilities: [],
          achievements: ["Reduced deployment time by 20%", "Built a release dashboard"],
        },
      ],
    } as unknown as Profile;

    const d = draftParagraphs({
      profile: experienceProfile,
      company: "Acme",
      role: "Engineer",
      posting: "Requirements: Python and TypeScript.",
    });
    const prose = d.paragraphs.join(" ");
    expect(prose).toContain("Platform Engineer at NewCo");
    expect(prose).toContain("I reduced deployment time by 20%.");
    expect(prose).toContain("I built a release dashboard.");
    expect(prose).not.toContain("Older Engineer");
    expect(d.bullets).toEqual([]);
  });

  test("does not infer total years from overlapping or incomplete dates", () => {
    const overlappingProfile = {
      ...profile,
      experience: [
        { title: "Engineer", company: "One", startDate: "2020", endDate: "2024" },
        { title: "Consultant", company: "Two", startDate: "2022", endDate: "Present" },
      ],
    } as unknown as Profile;
    const d = draftParagraphs({ profile: overlappingProfile, company: "Acme", role: "Engineer", posting: null });
    expect(d.paragraphs.join(" ")).not.toMatch(/\b\d+ years? of/i);
  });

  test("renderTyp escapes quotes, backslashes, and control characters once", () => {
    const typ = renderTyp(
      {
        profile,
        company: 'Acme "Secure"\\Labs',
        role: "Engineer",
        posting: null,
        recipient: "Hiring\nManager",
        template: "classic",
      },
      { paragraphs: ['Built "quoted" tooling.'], bullets: [], matched: [], gaps: [] },
    );
    expect(typ).toContain('company: "Acme \\"Secure\\"\\\\Labs",');
    expect(typ).toContain('recipient: "Hiring\\nManager",');
    expect(typ).toContain('    "Built \\"quoted\\" tooling.",');
    expect(typ).not.toContain('\\\\"Secure\\\\"');
  });
});

describe("buildPrepSheet", () => {
  test("technical questions come from required skills; gap prep never bluffs", () => {
    const sheet = buildPrepSheet("Senior engineer. Requirements: Python, Kubernetes. 6+ years.", profile);
    expect(sheet.technicalQuestions.join(" ").toLowerCase()).toContain("python");
    expect(sheet.gapPrep.map((g) => g.gap)).toContain("kubernetes");
    for (const g of sheet.gapPrep) expect(g.strategy.toLowerCase()).toContain("not bluff");
    expect(sheet.questionsToAsk.length).toBeGreaterThan(2);
  });

  test("null profile still produces a sheet with no fit score", () => {
    const sheet = buildPrepSheet("DevOps role. Requirements: Azure.", null);
    expect(sheet.fitScore).toBeNull();
    expect(sheet.behavioralQuestions.length).toBeGreaterThan(1);
  });
});
