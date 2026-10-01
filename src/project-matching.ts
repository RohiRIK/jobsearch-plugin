/**
 * Which portfolio projects belong on the CV for a given job.
 *
 * The failure this exists to prevent: a CV for an ML/AI engineering role
 * leading with an endpoint-management dashboard, or a device-tooling role
 * getting a RAG assistant instead of the fleet dashboard that is exactly the
 * work asked for. Both look like "relevant experience" to a keyword matcher —
 * they share Python, Docker, dashboards — and both are the wrong evidence.
 *
 * Matching is therefore on DOMAIN first and stack second. A domain is what the
 * project *is about*; a stack entry is what it happens to be built with. A
 * shared stack entry is weak evidence of relevance, a shared domain is strong
 * evidence, and a conflicting domain is grounds for exclusion however much the
 * stacks overlap.
 */

import type { PortfolioProject } from "./profile-schemas.js";

/**
 * Domain vocabulary. Each domain lists the posting phrases that imply it.
 *
 * Kept deliberately small and readable: this is a routing table between job
 * postings and portfolio work, not an ontology. Add a domain when a real
 * posting fails to route, not pre-emptively.
 */
export const PROJECT_DOMAINS: Record<string, string[]> = {
  "ml-ai": [
    "machine learning", "ml engineer", "deep learning", "llm", "genai", "generative ai",
    "rag", "vector database", "embeddings", "pytorch", "tensorflow", "model training",
    "mlops", "data scientist", "ai engineer", "nlp", "prompt engineering", "agentic",
  ],
  "solution-engineering": [
    "solution engineer", "solutions engineer", "sales engineer", "pre-sales", "presales",
    "technical discovery", "discovery workshop", "proof of concept", "technical demo", "solution design",
  ],
  "endpoint-management": [
    "intune", "mdm", "endpoint", "device management", "autopilot", "jamf", "workspace one",
    "sccm", "configuration manager", "device compliance", "fleet", "provisioning",
  ],
  "identity-access": [
    "entra", "azure ad", "active directory", "okta", "sso", "saml", "oauth", "oidc",
    "identity", "iam", "conditional access", "mfa", "privileged access", "pim", "scim",
    "zero trust", "ztna",
  ],
  "cloud-security": [
    "cloud security", "defender", "sentinel", "siem", "soc", "purview", "dlp",
    "threat detection", "incident response", "security engineer", "casb", "posture",
    "security telemetry", "telemetry", "edr", "ndr", "sysmon", "security operations",
  ],
  "cloud-infrastructure": [
    "azure", "aws", "gcp", "google cloud", "terraform", "bicep", "arm template",
    "infrastructure as code", "landing zone", "networking", "migration",
  ],
  "devops-platform": [
    "devops", "platform engineer", "kubernetes", "docker", "ci/cd", "pipeline",
    "sre", "observability", "prometheus", "grafana", "container", "swarm",
  ],
  automation: [
    "automation", "scripting", "powershell", "workflow", "orchestration", "n8n",
    "integration", "graph api", "rpa", "lifecycle",
  ],
  "web-fullstack": [
    "frontend", "front-end", "react", "next.js", "typescript", "full stack",
    "fullstack", "web application", "ui", "api development",
  ],
  "data-engineering": [
    "data engineer", "etl", "elt", "data pipeline", "warehouse", "opensearch",
    "elasticsearch", "analytics", "sql", "reporting",
  ],
  "iot-hardware": ["iot", "embedded", "raspberry pi", "sensor", "firmware", "edge device"],
};

/**
 * Domains that should actively suppress each other.
 *
 * Sharing a stack is not sharing a purpose. An ML posting that mentions Docker
 * must not pull in a Docker Swarm homelab; an endpoint posting must not pull in
 * a RAG assistant. Listing the pair here means a project carrying only the
 * opposing domain is excluded rather than merely ranked low.
 */
export const DOMAIN_CONFLICTS: Array<[string, string]> = [
  ["ml-ai", "endpoint-management"],
  ["ml-ai", "iot-hardware"],
  ["endpoint-management", "web-fullstack"],
  ["data-engineering", "iot-hardware"],
];

export interface ProjectMatch {
  project: PortfolioProject;
  /** 0-100. */
  score: number;
  /** Domains shared with the posting. */
  matchedDomains: string[];
  /** True when the project matches what the role primarily is. */
  matchesLeadDomain: boolean;
  /** Stack entries named by the posting. */
  matchedStack: string[];
  /** Set when the project is excluded, explaining why. */
  excludedBecause?: string;
  /** Human-readable justification, suitable for showing the user. */
  reason: string;
}

/**
 * Whole-phrase containment.
 *
 * Plain `includes` matched "llm" inside "enro-llm-ent", which tagged a JumpCloud
 * to Intune migration as machine-learning work and put it on an AI Engineer CV.
 * Short domain terms — llm, rag, mdm, sso, iam, iot — are all substrings of
 * ordinary words, so every hint match is anchored to word boundaries.
 */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

/**
 * Domains a posting implies, most-signalled first.
 *
 * The title counts triple. Body text is dominated by whatever the day-to-day
 * involves — a security-telemetry role lists Docker, CI/CD and monitoring far
 * more often than it says "SIEM" — so counting raw mentions ranked a platform
 * signal above the security one and put an Orange Pi sensor project ahead of
 * client security work. A recognized title-domain signal is deliberately
 * weighted high enough to stay primary over incidental body technologies.
 */
export function detectJobDomains(posting: string): string[] {
  const lower = posting.toLowerCase();
  const title = (posting.split("\n").find((l) => l.trim().length > 0) ?? "").toLowerCase();
  const hits: Array<{ domain: string; weight: number }> = [];
  for (const [domain, phrases] of Object.entries(PROJECT_DOMAINS)) {
    const body = phrases.filter((p) => containsPhrase(lower, p)).length;
    const inTitle = phrases.filter((p) => containsPhrase(title, p)).length;
    const weight = body + inTitle * 10;
    if (weight > 0) hits.push({ domain, weight });
  }
  return hits.sort((a, b) => b.weight - a.weight).map((h) => h.domain);
}

function conflicts(a: string, b: string): boolean {
  return DOMAIN_CONFLICTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/**
 * Rank one project against a posting.
 *
 * Scoring, out of 100:
 *   45  matches the posting's leading domain — the dominant signal
 *   15  matches a secondary domain
 *   25  stack overlap with the posting text
 *   10  work beats personal, all else equal: client work is stronger evidence
 *    5  the project states a concrete impact
 */
export function scoreProject(project: PortfolioProject, posting: string, jobDomains: string[]): ProjectMatch {
  const lower = posting.toLowerCase();
  const matchedDomains = project.domains.filter((d) => jobDomains.includes(d));
  const matchedStack = project.stack.filter((s) => containsPhrase(lower, s.toLowerCase()));

  // Exclusion runs before scoring: a project whose every domain conflicts with
  // the posting's leading domain is the wrong evidence no matter how well its
  // stack happens to line up.
  const leadDomain = jobDomains[0];
  if (leadDomain && project.domains.length > 0 && matchedDomains.length === 0) {
    // Conflict with the posting's LEADING domain is enough. Requiring every
    // domain to conflict let FleetWatch through to an ML posting, because its
    // secondary "data-engineering" tag is not opposed to ml-ai even though the
    // project is plainly endpoint work.
    const anyConflict = project.domains.some((d) => conflicts(d, leadDomain));
    if (anyConflict) {
      return {
        project,
        score: 0,
        matchedDomains: [],
        matchesLeadDomain: false,
        matchedStack,
        excludedBecause: `${project.domains.join("/")} conflicts with a ${leadDomain} role`,
        reason: `excluded — ${project.domains.join("/")} work is not evidence for a ${leadDomain} role`,
      };
    }
  }

  // Matching the posting's leading domain is what makes a project the right
  // evidence; matching a secondary one is a bonus. An earlier version divided
  // by the project's domain count, which rewarded narrowly-tagged projects — a
  // single-domain Docker homelab outscored a RAG assistant on an AI posting.
  // Secondary domains are weighted by their own rank rather than sharing a flat
  // pool. Splitting 15 points evenly meant that on a four-domain posting, client
  // security work matching the third domain scored 5 — less than a hobby project
  // that happened to match the first.
  const SECONDARY_WEIGHTS = [25, 15, 8, 4];
  const secondary = matchedDomains
    .filter((d) => d !== leadDomain)
    .reduce((sum, d) => sum + (SECONDARY_WEIGHTS[jobDomains.indexOf(d) - 1] ?? 2), 0);
  // Secondaries are capped below the lead award on purpose: matching what a role
  // primarily IS must beat matching several things it incidentally involves.
  // Uncapped, a hobby IoT project matching automation + devops outscored client
  // security work on a security-telemetry role.
  const domainScore = (matchedDomains.includes(leadDomain ?? "") ? 45 : 0) + Math.min(30, secondary);
  const stackScore = project.stack.length === 0 ? 0 : (matchedStack.length / project.stack.length) * 25;
  const kindScore = project.kind === "work" ? 10 : 0;
  const impactScore = project.impact ? 5 : 0;
  const score = Math.round(Math.min(100, domainScore + stackScore + kindScore + impactScore));

  const parts: string[] = [];
  if (matchedDomains.length) parts.push(`domains: ${matchedDomains.join(", ")}`);
  if (matchedStack.length) parts.push(`stack: ${matchedStack.slice(0, 5).join(", ")}`);
  if (project.kind === "work") parts.push("client work");
  if (!parts.length) parts.push("no domain or stack overlap");

  return {
    project,
    score,
    matchedDomains,
    matchesLeadDomain: matchedDomains.includes(leadDomain ?? ""),
    matchedStack,
    reason: parts.join(" · "),
  };
}

export interface ProjectSelection {
  /** Projects worth putting on this CV, best first. */
  selected: ProjectMatch[];
  /** Everything else, with the reason it did not make the cut. */
  rejected: ProjectMatch[];
  /** Domains detected in the posting. */
  jobDomains: string[];
}

/**
 * Choose the projects for one application.
 *
 * `limit` caps how many reach the CV — a CV that lists ten projects makes the
 * reader do the ranking. `minScore` keeps weak matches off entirely: padding a
 * CV with unrelated work is worse than a shorter, sharper one.
 */
export function selectProjects(
  projects: PortfolioProject[],
  posting: string,
  options: { limit?: number; minScore?: number } = {},
): ProjectSelection {
  const limit = options.limit ?? 4;
  const minScore = options.minScore ?? 25;
  const jobDomains = detectJobDomains(posting);

  const scored = projects
    .map((p) => scoreProject(p, posting, jobDomains))
    // Tiebreaks in order: matching what the role primarily is, then client work
    // over personal. Falling straight to alphabetical put "Air Quality
    // Automation" above client security work at an identical score.
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.matchesLeadDomain) - Number(a.matchesLeadDomain) ||
        Number(b.project.kind === "work") - Number(a.project.kind === "work") ||
        a.project.name.localeCompare(b.project.name),
    );

  const selected = scored.filter((m) => !m.excludedBecause && m.score >= minScore).slice(0, limit);
  const selectedSlugs = new Set(selected.map((m) => m.project.slug));
  const rejected = scored.filter((m) => !selectedSlugs.has(m.project.slug));

  return { selected, rejected, jobDomains };
}
