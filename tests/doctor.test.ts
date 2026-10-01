import { describe, expect, test } from "bun:test";
import { runChecks } from "../scripts/doctor.js";

describe("doctor runChecks", () => {
  test("always reports bun as a required, present tool", () => {
    const results = runChecks();
    const bun = results.find((r) => r.tool === "bun");
    expect(bun).toBeDefined();
    expect(bun!.required).toBe(true);
    expect(bun!.status).toBe("ok");
    expect(bun!.path).not.toBeNull();
  });

  test("missing tools carry an install hint, present ones do not", () => {
    for (const r of runChecks()) {
      if (r.status === "missing") expect(r.installHint).toBeTruthy();
      else expect(r.installHint).toBeUndefined();
    }
  });

  test("every tool reports what it unlocks", () => {
    for (const r of runChecks()) expect(r.unlocks.length).toBeGreaterThan(0);
  });
});
