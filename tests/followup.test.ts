import { describe, expect, test } from "bun:test";
import { pendingFollowups } from "../scripts/followup.js";
import type { JobApplication } from "../src/schemas.js";

const now = new Date("2026-07-10");

function app(overrides: Partial<JobApplication>): JobApplication {
  return {
    id: "app_20260701_acme",
    date: "2026-07-01",
    company: "Acme",
    role: "Engineer",
    status: "applied",
    ...overrides,
  } as JobApplication;
}

describe("pendingFollowups", () => {
  test("applied older than threshold is pending", () => {
    const pending = pendingFollowups([app({})], 7, now);
    expect(pending).toHaveLength(1);
    expect(pending[0].daysSinceApplied).toBe(9);
  });

  test("recent applications are not pending", () => {
    expect(pendingFollowups([app({ date: "2026-07-08" })], 7, now)).toHaveLength(0);
  });

  test("non-applied statuses excluded", () => {
    expect(pendingFollowups([app({ status: "rejected" })], 7, now)).toHaveLength(0);
  });

  test("already followed-up excluded", () => {
    expect(pendingFollowups([app({ notes: "sent [followup 2026-07-05]" })], 7, now)).toHaveLength(0);
  });

  test("sorted by days descending", () => {
    const pending = pendingFollowups(
      [app({ id: "app_20260601_a", date: "2026-06-01" }), app({ id: "app_20260701_b", date: "2026-07-01" })],
      7,
      now,
    );
    expect(pending[0].id).toBe("app_20260601_a");
  });
});
