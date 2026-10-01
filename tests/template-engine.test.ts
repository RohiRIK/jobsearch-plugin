import { describe, expect, test } from "bun:test";
import {
  extractJobSignals,
  deriveProfileFacts,
  scoreTemplate,
  selectTemplates,
  type RegistryEntry,
} from "../scripts/match/template-engine.js";
import type { TemplateMeta } from "../src/schemas.js";
import type { Profile } from "../src/profile-schemas.js";

function meta(overrides: Partial<TemplateMeta> = {}): TemplateMeta {
  return {
    name: "banking",
    engine: "typst",
    source: "template.typ",
    formality: "formal",
    sectors: ["finance", "enterprise"],
    markets: ["dk", "us", "eu"],
    style: "conservative",
    pages: 2,
    features: ["rtl_support", "bullet_lists"],
    description: "test",
    ...overrides,
  } as TemplateMeta;
}

function registry(entries: Array<Partial<RegistryEntry> & { meta: TemplateMeta }>): RegistryEntry[] {
  return entries.map((e) => ({ type: "cv", available: true, ...e }) as RegistryEntry);
}

const IL_POSTING = `Senior DevOps Engineer — Tel Aviv, Israel
Large multinational bank. 8+ years experience. Azure, Kubernetes. AZ-104 certification required.
Hebrew required. עברית. Please submit your application with a cover letter.`;

const US_POSTING = `Hey! Fun startup in Austin seeks junior frontend developer.
React, TypeScript. Join our awesome team! Seed stage.`;

describe("extractJobSignals", () => {
  test("detects Israeli market, RTL, senior level, formality, certifications", () => {
    const s = extractJobSignals(IL_POSTING);
    expect(s.market).toBe("il");
    expect(s.rtl).toBe(true);
    expect(s.seniority).toBe("senior");
    expect(s.formality).toBe("formal");
    expect(s.certifications).toContain("Azure");
    expect(s.sectors).toContain("finance");
    expect(s.roleType).toBe("technical");
  });

  test("detects casual junior startup posting", () => {
    const s = extractJobSignals(US_POSTING);
    expect(s.market).toBe("us");
    expect(s.rtl).toBe(false);
    expect(s.seniority).toBe("junior");
    expect(s.formality).toBe("casual");
    expect(s.sectors).toContain("startup");
    expect(s.companySize).toBe("small");
  });

  test("no signals yields unknowns, not crashes", () => {
    const s = extractJobSignals("We are hiring a person.");
    expect(s.market).toBe("unknown");
    expect(s.seniority).toBe("unknown");
    expect(s.sectors).toEqual([]);
  });

  test("leadership roles detected", () => {
    const s = extractJobSignals("Head of Infrastructure wanted in Copenhagen, Denmark.");
    expect(s.roleType).toBe("leadership");
    expect(s.seniority).toBe("executive");
    expect(s.market).toBe("dk");
  });
});

describe("deriveProfileFacts", () => {
  test("null profile is fully neutral", () => {
    const f = deriveProfileFacts(null);
    expect(f.completeness).toBe(0);
    expect(f.seniority).toBe("unknown");
    expect(f.years).toBeNull();
  });

  test("empty sections reported as missing, never fabricated", () => {
    const f = deriveProfileFacts({
      identity: { name: "X" },
      skills: [{ category: "Langs", skills: ["TypeScript"] }],
    } as Profile);
    expect(f.skills).toEqual(["typescript"]);
    expect(f.missing).toContain("experience");
    expect(f.missing).toContain("education");
    expect(f.completeness).toBe(0.25);
  });

  test("experience years drive seniority", () => {
    const f = deriveProfileFacts({
      identity: { name: "X" },
      experience: [{ title: "Eng", company: "A", startDate: "2018", endDate: "2026" }],
    } as Profile);
    expect(f.years).toBe(8);
    expect(f.seniority).toBe("senior");
  });

  test("military service does not inflate template seniority", () => {
    const f = deriveProfileFacts({
      identity: { name: "X" },
      experience: [
        { title: "Engineer", company: "A", startDate: "2021", endDate: "2025", experienceType: "professional" },
        { title: "Squad Leader", company: "National Army", startDate: "2010", endDate: "2018", experienceType: "military-service" },
      ],
    } as Profile);
    expect(f.years).toBe(4);
    expect(f.seniority).toBe("mid");
  });
});

describe("scoreTemplate", () => {
  test("RTL posting zeroes market factor for non-RTL template", () => {
    const signals = extractJobSignals(IL_POSTING);
    const facts = deriveProfileFacts(null);
    const noRtl = meta({ name: "plain", features: ["bullet_lists"], markets: ["il"] });
    const scored = scoreTemplate(noRtl, "cv", true, signals, facts, false);
    const market = scored.factors.find((f) => f.factor === "market");
    expect(market?.raw).toBe(0);
    expect(scored.warnings.join(" ")).toContain("RTL");
  });

  test("photo requirement without staged photo warns and penalizes", () => {
    const signals = extractJobSignals(US_POSTING);
    const facts = deriveProfileFacts(null);
    const photoTpl = meta({
      name: "creative",
      style: "creative",
      assets: { photo: { required: true, position: "left-sidebar", size: "3cm" } },
    });
    const scored = scoreTemplate(photoTpl, "cv", true, signals, facts, false);
    expect(scored.warnings.join(" ")).toContain("photo");
    const profileFit = scored.factors.find((f) => f.factor === "profile_fit");
    expect(profileFit!.raw).toBeLessThan(0.5);
  });

  test("scores are bounded 0-100", () => {
    const signals = extractJobSignals(IL_POSTING);
    const facts = deriveProfileFacts(null);
    for (const style of ["conservative", "modern", "creative"] as const) {
      const scored = scoreTemplate(meta({ style }), "cv", true, signals, facts, true);
      expect(scored.score).toBeGreaterThanOrEqual(0);
      expect(scored.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("selectTemplates", () => {
  const modern = meta({ name: "modern", formality: "semi-formal", style: "modern", sectors: ["tech", "startup"], markets: ["us", "il"] });
  const banking = meta({ name: "banking" });

  test("stub never auto-selected — falls back to available with warning", () => {
    const reg = registry([
      { meta: modern, available: false },
      { meta: banking, available: true },
    ]);
    const r = selectTemplates(US_POSTING, null, reg);
    expect(r.cv[0].name).toBe("modern");
    expect(r.cv[0].available).toBe(false);
    expect(r.selected.cv).toBe("banking");
    expect(r.warnings.join(" ")).toContain("stub");
  });

  test("include-stubs option allows stub selection", () => {
    const reg = registry([
      { meta: modern, available: false },
      { meta: banking, available: true },
    ]);
    const r = selectTemplates(US_POSTING, null, reg, { includeStubs: true });
    expect(r.selected.cv).toBe("modern");
  });

  test("override forces named template", () => {
    const reg = registry([{ meta: modern }, { meta: banking }]);
    const r = selectTemplates(US_POSTING, null, reg, { override: "banking" });
    expect(r.selected.cv).toBe("banking");
  });

  test("empty registry yields null selection, no crash", () => {
    const r = selectTemplates(US_POSTING, null, []);
    expect(r.selected.cv).toBeNull();
    expect(r.selected.cover).toBeNull();
  });

  test("null profile lowers confidence and reports neutrality honestly", () => {
    const reg = registry([{ meta: banking }]);
    const r = selectTemplates("We are hiring a person.", null, reg);
    expect(r.confidence.level).toBe("low");
    expect(r.confidence.reasons.join(" ")).toContain("profile completeness 0%");
    expect(r.neutral.length).toBeGreaterThan(0);
  });

  test("strong signals + complete-ish profile raise confidence", () => {
    const reg = registry([{ meta: banking }]);
    const profile = {
      identity: { name: "X" },
      skills: [{ category: "Langs", skills: ["PowerShell", "Python"] }],
      experience: [{ title: "Eng", company: "A", startDate: "2018" }],
      education: [{ institution: "U", degree: "BSc" }],
      certifications: [{ name: "AZ-104" }],
    } as Profile;
    const r = selectTemplates(IL_POSTING, profile, reg);
    expect(r.confidence.level).toBe("high");
  });
});
