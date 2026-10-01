import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { getPageCount } from "../scripts/verify-ats.js";

const FIXTURES = resolve(import.meta.dir, "fixtures");

// getPageCount underpins the reevaluation page gate (CV=2, CL=1), so a wrong
// count would silently pass or fail real documents. Fixtures are committed
// PDFs; where pdfinfo exists it is used, otherwise the latin1 raw scan runs —
// both must return the same true count.
describe("getPageCount", () => {
  test("counts a single-page PDF as 1", () => {
    expect(getPageCount(join(FIXTURES, "one-page.pdf"))).toBe(1);
  });

  test("counts a two-page PDF as 2", () => {
    expect(getPageCount(join(FIXTURES, "two-page.pdf"))).toBe(2);
  });

  test("returns null for a missing file", () => {
    expect(getPageCount(join(FIXTURES, "does-not-exist.pdf"))).toBeNull();
  });
});
