import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  anglicize,
  matchScore,
  normalize,
  searchCompany,
  type SalaryData,
} from "../src/helpers.js";
import { runCLI, parseJSON } from "./helpers.js";

describe("normalize", () => {
  test("strips legal suffixes and punctuation (Danish)", () => {
    expect(normalize("Novo Nordisk A/S")).toBe("novonordisk");
    expect(normalize("Ørsted A/S")).toBe("ørsted");
  });

  test("strips Hebrew Ltd suffix and folds finals", () => {
    // בע"מ (Ltd) removed; final mem folded to base mem
    expect(normalize('צ\'ק פוינט בע"מ')).toBe(normalize("צ'ק פוינט"));
    expect(normalize("חברה בעמ")).toBe("חברה");
  });
});

describe("matchScore", () => {
  test("exact normalized match scores 100", () => {
    expect(matchScore("Novo Nordisk", "Novo Nordisk A/S")).toBe(100);
  });

  test("anglicized Danish spelling matches", () => {
    expect(matchScore("Orsted", "Ørsted A/S")).toBeGreaterThanOrEqual(75);
  });

  test("unrelated companies score 0", () => {
    expect(matchScore("Maersk", "Novo Nordisk")).toBe(0);
  });

  test("Hebrew name matches across final-form variants", () => {
    expect(matchScore("צ'ק פוינט", 'צ\'ק פוינט בע"מ')).toBe(100);
  });
});

describe("anglicize", () => {
  test("maps Nordic characters", () => {
    expect(anglicize("ørsted")).toBe("orsted");
    expect(anglicize("æble")).toBe("aeble");
  });
});

describe("searchCompany", () => {
  const data: SalaryData = {
    metadata: { index_baseline: 100 },
    companies: [
      { company: "Novo Nordisk A/S", city: "Bagsværd", categories: { all: { count: 500, index: 108.5 } } },
      { company: "Ørsted A/S", city: "Fredericia", categories: { all: { count: 200, index: 105.2 } } },
      { company: "Check Point Software Technologies Ltd", city: "Tel Aviv", categories: { all: { count: 300, index: 115.0 } } },
    ],
  };

  test("finds Danish company by partial name", () => {
    const r = searchCompany(data, "Novo");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]!.company).toContain("Novo");
  });

  test("city filter narrows results", () => {
    const r = searchCompany(data, "Ørsted", "Fredericia");
    expect(r).toHaveLength(1);
  });

  test("finds Israeli company, Ltd suffix ignored", () => {
    const r = searchCompany(data, "Check Point");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]!.company).toContain("Check Point");
  });
});

describe("CLI end-to-end", () => {
  let dir: string;
  let dataPath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "salary-test-"));
    dataPath = join(dir, "salary_data.json");
    const data: SalaryData = {
      metadata: { index_baseline: 100, index_label: "Index" },
      companies: [
        { company: "Novo Nordisk A/S", city: "Bagsværd", categories: { all_employees: { count: 500, index: 108.5 } } },
      ],
    };
    writeFileSync(dataPath, JSON.stringify(data), "utf-8");
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("lookup returns JSON match", async () => {
    const res = await runCLI(["lookup", "Novo", "--data", dataPath, "--format", "json"]);
    const parsed = parseJSON<Array<{ company: string }>>(res);
    expect(parsed[0]!.company).toBe("Novo Nordisk A/S");
  });

  test("missing company exits 1 with stderr JSON error", async () => {
    const res = await runCLI(["lookup", "NonexistentCorp", "--data", dataPath, "--format", "json"]);
    expect(res.exitCode).toBe(1);
    expect(JSON.parse(res.stderr).code).toBe("NOT_FOUND");
  });

  test("missing data file prints guidance and exits 1", async () => {
    const res = await runCLI(["lookup", "Novo", "--data", join(dir, "nope.json")]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("not found");
  });

  test("list lists companies", async () => {
    const res = await runCLI(["list", "--data", dataPath]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("Novo Nordisk A/S");
  });

  test("convert turns a workbook into salary_data.json", async () => {
    const { utils, writeFile } = await import("xlsx");
    const wb = utils.book_new();
    const ws = utils.aoa_to_sheet([
      ["Company", "City", "All Count", "All Index"],
      ["Acme Corp", "Tel Aviv", 120, 104.2],
    ]);
    utils.book_append_sheet(wb, ws, "Sheet1");
    const xlsxPath = join(dir, "in.xlsx");
    writeFile(wb, xlsxPath);

    const outPath = join(dir, "converted.json");
    const res = await runCLI(["convert", xlsxPath, "--output", outPath, "--format", "json"]);
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdout) as { wrote: number };
    expect(parsed.wrote).toBe(1);
  });
});
