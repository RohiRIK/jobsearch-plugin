import { describe, expect, test } from "bun:test";
import { inferHeading, summarizeText } from "../scripts/jobs/summarize.js";

describe("inferHeading", () => {
  test("LinkedIn shape: title on line 1, 'Company · Location' on line 2", () => {
    const { title, company } = inferHeading(
      "Senior Cloud Security Engineer\nN26 · Berlin, Berlin, Germany\nSeniority: Mid-Senior level",
    );
    expect(title).toBe("Senior Cloud Security Engineer");
    expect(company).toBe("N26");
  });

  test("labelled shape wins over positional guessing", () => {
    const { title, company } = inferHeading(
      "Company: Check Point Software Technologies\nRole: IT System Administrator\nLocation: Tel Aviv-Yafo, Israel",
    );
    expect(title).toBe("IT System Administrator");
    expect(company).toBe("Check Point Software Technologies");
  });

  test("em-dash joins title and company", () => {
    const { title, company } = inferHeading("(Senior / Staff) IT Operations Specialist (m/f/d) — 1KOMMA5°\nLocation: Berlin");
    expect(title).toBe("(Senior / Staff) IT Operations Specialist (m/f/d)");
    expect(company).toBe("1KOMMA5°");
  });

  // Negative: a plain hyphen is part of the title, not a title/company separator.
  // Splitting here invented the company "Infrastructure and Cyber Security".
  test("plain hyphen inside a title is not a company separator", () => {
    const { title, company } = inferHeading("IT Specialist - Infrastructure and Cyber Security\nAarhus N, Denmark");
    expect(title).toBe("IT Specialist - Infrastructure and Cyber Security");
    expect(company).toBeUndefined();
  });

  test("empty input yields nothing rather than throwing", () => {
    expect(inferHeading("")).toEqual({});
    expect(inferHeading("   \n\n  ")).toEqual({});
  });

  test("explicit overrides beat inference", () => {
    const jd = summarizeText("Senior Cloud Security Engineer\nN26 · Berlin, Germany", {
      title: "Override Title",
      company: "Override Co",
    });
    expect(jd.title).toBe("Override Title");
    expect(jd.company).toBe("Override Co");
  });

  test("summarizeText populates title/company with no overrides", () => {
    const jd = summarizeText("Senior Cloud Security Engineer\nN26 · Berlin, Germany");
    expect(jd.title).toBe("Senior Cloud Security Engineer");
    expect(jd.company).toBe("N26");
  });
});
