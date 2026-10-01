import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Tracker } from "../src/tracker.js";

let dir: string;
let tracker: Tracker;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tracker-test-"));
  tracker = new Tracker(join(dir, "test.db"));
});

afterEach(() => {
  tracker.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("Tracker CRUD", () => {
  test("insert and get", () => {
    const app = tracker.insert({ id: "app_20260710_acme", date: "2026-07-10", company: "Acme", role: "Engineer", status: "planning" });
    expect(app.company).toBe("Acme");
    expect(tracker.get("app_20260710_acme")?.role).toBe("Engineer");
  });

  test("update status", () => {
    tracker.insert({ id: "app_20260710_acme", date: "2026-07-10", company: "Acme", role: "Engineer", status: "planning" });
    const updated = tracker.update("app_20260710_acme", { status: "applied" });
    expect(updated?.status).toBe("applied");
  });

  test("list filters by status", () => {
    tracker.insert({ id: "app_20260710_a", date: "2026-07-10", company: "A", role: "R", status: "applied" });
    tracker.insert({ id: "app_20260710_b", date: "2026-07-10", company: "B", role: "R", status: "planning" });
    expect(tracker.list({ status: "applied" })).toHaveLength(1);
    expect(tracker.list()).toHaveLength(2);
  });

  test("delete removes row", () => {
    tracker.insert({ id: "app_20260710_a", date: "2026-07-10", company: "A", role: "R", status: "planning" });
    expect(tracker.delete("app_20260710_a")).toBe(true);
    expect(tracker.get("app_20260710_a")).toBeNull();
  });
});

describe("document versions", () => {
  test("add and list", () => {
    const v = tracker.addDocumentVersion({ file_path: "cv/Acme_CV.pdf", template_used: "banking", company: "Acme" });
    expect(v.id).toBeGreaterThan(0);
    expect(tracker.listDocumentVersions({ template: "banking" })).toHaveLength(1);
    expect(tracker.listDocumentVersions({ template: "modern" })).toHaveLength(0);
  });

  test("outcome filter joins applications", () => {
    tracker.insert({ id: "app_20260710_acme", date: "2026-07-10", company: "Acme", role: "R", status: "rejected" });
    tracker.addDocumentVersion({ file_path: "a.pdf", template_used: "banking", application_id: "app_20260710_acme" });
    tracker.addDocumentVersion({ file_path: "b.pdf", template_used: "banking" });
    const rejected = tracker.listDocumentVersions({ outcome: "rejected" });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].application_status).toBe("rejected");
  });
});
