import { computeContentHash, type SeenJobEntry, type SeenJobsFile } from "./schemas.js";

const TRACKING_PARAMETERS = /^(utm_|fbclid$|gclid$|source$|campaign$|ref$)/i;

export function canonicalizeJobUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETERS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export interface IngestedJob {
  entry: SeenJobEntry;
  duplicate: boolean;
  existingUrl?: string;
}

export function ingestPortalCard(
  card: Record<string, unknown>,
  input: { portal: string; market: SeenJobEntry["market"]; observedAt: string; seen: SeenJobsFile["seen"] },
): IngestedJob | null {
  const rawUrl = String(card.url ?? card.link ?? "");
  const title = String(card.title ?? card.name ?? "").trim();
  if (!rawUrl.startsWith("http") || !title) return null;

  const url = canonicalizeJobUrl(rawUrl);
  const company = String(card.company ?? card.employer ?? "unknown").trim() || "unknown";
  const location = String(card.location ?? card.city ?? "unknown").trim() || "unknown";
  const contentHash = computeContentHash(title, company, location);
  const description = String(card.description ?? card.descriptionText ?? card.excerpt ?? "").trim();
  const existing = Object.entries(input.seen).find(([existingUrl, entry]) =>
    existingUrl === url || entry.content_hash === contentHash
  );
  if (existing) {
    const refreshed: SeenJobEntry = {
      ...existing[1],
      last_seen: input.observedAt,
      source_portal: input.portal,
      ...(description ? { description: description.slice(0, 50_000) } : {}),
    };
    return { entry: refreshed, duplicate: true, existingUrl: existing[0] };
  }

  const entry: SeenJobEntry = {
    title,
    company,
    location,
    market: input.market,
    url,
    first_seen: input.observedAt,
    last_seen: input.observedAt,
    source_portal: input.portal,
    content_hash: contentHash,
    ...(description ? { description: description.slice(0, 50_000) } : {}),
    fit: "medium",
    status: "new",
  };
  return { entry, duplicate: false };
}
