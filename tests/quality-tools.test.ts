import { describe, expect, test } from "bun:test";
import { computeTrends } from "../scripts/jobs/trajectory.js";
import type { MarketSnapshot } from "../scripts/jobs/market.js";
import { buildSnapshot } from "../scripts/jobs/market.js";
import { applicationDir, buildOutputName, buildSourcePath, parseFileName, type DocConfig } from "../src/naming.js";
import type { SeenJobEntry } from "../src/schemas.js";

function snap(date: string, skills: Array<[string, number]>): MarketSnapshot {
  return {
    date,
    totalJobs: skills.reduce((a, [, c]) => a + c, 0),
    byMarket: {},
    byFit: {},
    byStatus: {},
    topSkills: skills.map(([skill, count]) => ({ skill, count })),
    topCompanies: [],
    topLocations: [],
  };
}

describe("computeTrends", () => {
  test("classifies rising, falling, flat, and newly-appeared skills", () => {
    const trends = computeTrends(
      [snap("2026-07-01", [["devops", 5], ["aws", 3], ["git", 2]]), snap("2026-07-11", [["devops", 12], ["git", 2], ["kubernetes", 4]])],
      10
    );
    const by = Object.fromEntries(trends.map((t) => [t.skill, t]));
    expect(by.devops.direction).toBe("rising");
    expect(by.devops.delta).toBe(7);
    expect(by.aws.direction).toBe("falling");
    expect(by.kubernetes.first).toBe(0);
    expect(by.kubernetes.direction).toBe("rising");
    expect(by.git.direction).toBe("flat");
  });

  test("snapshot order does not matter and top-N caps output", () => {
    const a = snap("2026-07-01", [["a", 1], ["b", 1], ["c", 1]]);
    const b = snap("2026-07-11", [["a", 9], ["b", 5], ["c", 2]]);
    const reversed = computeTrends([b, a], 2);
    expect(reversed.length).toBe(2);
    expect(reversed[0].skill).toBe("a");
    expect(reversed[0].delta).toBe(8);
  });
});

describe("buildSnapshot", () => {
  const entry = (over: Partial<SeenJobEntry>): SeenJobEntry => ({
    title: "DevOps Engineer",
    company: "Acme",
    location: "Tel Aviv",
    market: "il",
    url: "https://x.example/1",
    first_seen: "2026-07-11",
    fit: "medium",
    status: "new",
    ...over,
  });

  test("tallies markets, fit, status and counts skills in titles", () => {
    const s = buildSnapshot(
      [entry({}), entry({ market: "eu", title: "Python Developer", url: "https://x.example/2" }), entry({ status: "evaluated", url: "https://x.example/3" })],
      "2026-07-11"
    );
    expect(s.totalJobs).toBe(3);
    expect(s.byMarket.il).toBe(2);
    expect(s.byMarket.eu).toBe(1);
    expect(s.byStatus.new).toBe(2);
    expect(s.topSkills.find((t) => t.skill === "devops")?.count).toBe(2);
    expect(s.topSkills.find((t) => t.skill === "python")?.count).toBe(1);
  });

  test("empty input yields an honest empty snapshot", () => {
    const s = buildSnapshot([], "2026-07-11");
    expect(s.totalJobs).toBe(0);
    expect(s.topSkills).toEqual([]);
  });
});

describe("naming roundtrip", () => {
  const cfg: DocConfig = {
    name: "Jane-Doe",
    applicationsDir: "assets/applications",
    cvDir: "assets/cv",
    coverDir: "assets/cover_letters",
    sourceExt: "typ",
    fieldSeparator: "_",
    wordSeparator: "-",
  };

  test("buildSourcePath groups by company and date under applicationsDir", () => {
    const p = buildSourcePath("cl", "Acme Corp", "DevOps Engineer", cfg, "2026-07-12");
    expect(p).toBe("assets/applications/Acme-Corp/2026-07-12/Jane-Doe_Acme-Corp_DevOps-Engineer_CL.typ");
  });

  test("applicationDir slugifies the company and never contains spaces", () => {
    const d = applicationDir("Big Bank A/S", cfg, "2026-07-12");
    expect(d).toBe("assets/applications/Big-Bank-AS/2026-07-12");
    expect(d).not.toContain(" ");
  });

  test("spaces are slugified — convention names can never contain them", () => {
    const name = buildOutputName("cl", "Acme Corp Ltd", "Senior DevOps Engineer", cfg);
    expect(name).toBe("Jane-Doe_Acme-Corp-Ltd_Senior-DevOps-Engineer_CL");
    expect(name).not.toContain(" ");
  });

  test("parseFileName inverts buildOutputName", () => {
    const name = buildOutputName("cv", "Big Bank", "Endpoint Engineer", cfg);
    const parsed = parseFileName(name, cfg);
    expect(parsed).not.toBeNull();
    expect(parsed!.docType).toBe("cv");
    expect(parsed!.company.toLowerCase()).toContain("big");
    expect(parsed!.role.toLowerCase()).toContain("endpoint");
  });

  test("garbage names do not parse", () => {
    expect(parseFileName("bad name with spaces", cfg)).toBeNull();
    expect(parseFileName("cover_acme_role", cfg)).toBeNull();
  });
});
