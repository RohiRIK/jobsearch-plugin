import { describe, expect, test } from "bun:test";
import { canonicalizeJobUrl, ingestPortalCard } from "../src/job-ingestion.js";

 describe("job ingestion normalization", () => {
  test("removes tracking noise while preserving meaningful query parameters", () => {
    const value = canonicalizeJobUrl("HTTPS://Example.test/jobs/42/?utm_source=board&lang=en#apply");
    expect(value).toBe("https://example.test/jobs/42?lang=en");
  });

  test("stores provenance, stable content identity, and available description text", () => {
    const ingested = ingestPortalCard(
      { url: "https://example.test/jobs/42?utm_campaign=x", title: "Platform Engineer", company: "Acme", location: "Berlin", description: "Build Python platforms." },
      { portal: "fixture", market: "eu", observedAt: "2026-09-23", seen: {} },
    );

    expect(ingested?.duplicate).toBe(false);
    expect(ingested?.entry).toMatchObject({
      url: "https://example.test/jobs/42",
      source_portal: "fixture",
      first_seen: "2026-09-23",
      last_seen: "2026-09-23",
      status: "new",
      fit: "medium",
    });
    expect(ingested?.entry.content_hash).toBeTruthy();
    expect(ingested?.entry.description).toContain("Python");
  });

  test("deduplicates the same role across canonical URL and portal changes", () => {
    const first = ingestPortalCard(
      { url: "https://example.test/jobs/42", title: "Platform Engineer", company: "Acme", location: "Berlin" },
      { portal: "one", market: "eu", observedAt: "2026-09-23", seen: {} },
    )!;
    const seen = { [first.entry.url]: first.entry };

    const duplicate = ingestPortalCard(
      { url: "https://example.test/jobs/42?source=portal-two", title: "Platform Engineer", company: "Acme", location: "Berlin" },
      { portal: "two", market: "eu", observedAt: "2026-09-24", seen },
    );

    expect(duplicate?.duplicate).toBe(true);
    expect(duplicate?.existingUrl).toBe(first.entry.url);
    expect(duplicate?.entry.last_seen).toBe("2026-09-24");
    expect(duplicate?.entry.source_portal).toBe("two");
  });
});
