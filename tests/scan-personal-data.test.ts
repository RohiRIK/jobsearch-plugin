import { describe, expect, test } from "bun:test";
import { redact, scanText } from "../scripts/scan-personal-data.js";

const FILE = "some/file.md";

// This scanner is the last line of defence before a public push, so it needs
// both directions tested. A scanner that never fires is indistinguishable from
// a clean repo, and a scanner that fires on every placeholder gets disabled.
describe("scanText — catches real contact details", () => {
  test("a real-looking email address", () => {
    const found = scanText("contact: someone@somedomain.co.il", FILE);
    expect(found).toHaveLength(1);
    expect(found[0].pattern).toBe("email address");
  });

  test("an international phone number", () => {
    const found = scanText("phone: +972-52-000-0000", FILE);
    expect(found.some((f) => f.pattern === "international phone number")).toBe(true);
  });

  test("a LinkedIn profile URL", () => {
    const found = scanText("see linkedin.com/in/some-real-person-00000000", FILE);
    expect(found.some((f) => f.pattern === "LinkedIn profile URL")).toBe(true);
  });

  test("reports the line number so it can be found", () => {
    const found = scanText("clean\nclean\nreal.person@company.com", FILE);
    expect(found[0].line).toBe(3);
  });

  test("never echoes the full value into output", () => {
    const found = scanText("contact: someone@somedomain.co.il", FILE);
    expect(found[0].match).not.toContain("somedomain");
    expect(found[0].match).toContain("*");
  });
});

describe("scanText — allows documented placeholders", () => {
  const clean = [
    "candidate@example.com",
    "first.last@mail.example.co.uk",
    "jane.candidate@example.com",
    "noreply@github.com",
    "108658615+RohiRIK@users.noreply.github.com",
    "noreply@anthropic.com",
    "+1 202 555 0147",
    "+1-555-010-4477",
    "call 555 0147",
    '"phoneNumber": "+4512345678"',
    "linkedin.com/in/your-profile",
  ];

  for (const value of clean) {
    test(`allows ${value}`, () => {
      expect(scanText(value, FILE)).toEqual([]);
    });
  }
});

describe("scanText — skips its own definitions", () => {
  test("the scanner, its test, and the workflow are not scanned against themselves", () => {
    const text = "someone@somedomain.co.il";
    expect(scanText(text, "scripts/scan-personal-data.ts")).toEqual([]);
    expect(scanText(text, "tests/scan-personal-data.test.ts")).toEqual([]);
    expect(scanText(text, ".github/workflows/personal-data.yml")).toEqual([]);
  });

  test("but an ordinary file with the same content is still caught", () => {
    expect(scanText("someone@somedomain.co.il", "docs/notes.md")).toHaveLength(1);
  });
});

describe("redact", () => {
  test("keeps enough to locate, not enough to harvest", () => {
    const out = redact("someone@somedomain.co.il");
    expect(out.startsWith("so")).toBe(true);
    expect(out.endsWith("il")).toBe(true);
    expect(out).not.toContain("somedomain");
  });

  test("fully masks a very short value", () => {
    expect(redact("abc")).toBe("***");
  });
});
