export interface SkillAliasGroup {
  /** Stable semantic identifier used only for controlled synonym lookup. */
  key: string;
  /** Human-readable name for documentation and diagnostics. */
  label: string;
  /** Normalized phrases that genuinely mean the same candidate capability. */
  terms: readonly string[];
}

/**
 * The deterministic job-description vocabulary. Keep this finite and explicit:
 * every term is something the JD parser can recognise, not a claim about any
 * particular candidate.
 */
export const SKILL_TERMS = [
  "typescript", "javascript", "python", "java", "c#", "c++", "go", "rust", "ruby", "php", "swift", "kotlin", "scala", "bash", "powershell", "sql", "html", "css",
  "react", "next.js", "vue", "angular", "svelte", "node.js", "bun", "deno", "express", "nestjs", "django", "flask", "fastapi", "spring", ".net", "rails",
  "aws", "azure", "gcp", "cloud", "docker", "kubernetes", "terraform", "ansible", "ci/cd", "jenkins", "github actions", "gitlab",
  "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch", "sqlite", "kafka", "rabbitmq",
  "machine learning", "deep learning", "nlp", "llm", "data science", "pandas", "numpy", "pytorch", "tensorflow", "scikit-learn", "mlops",
  "intune", "entra", "active directory", "azure ad", "microsoft 365", "m365", "exchange", "sccm", "mdm", "jamf", "endpoint",
  "okta", "sso", "saml", "oauth", "oidc", "scim", "jit", "mfa", "fido",
  "security", "siem", "soc", "incident response", "penetration testing", "vulnerability", "compliance", "iso 27001", "soc 2",
  "linux", "windows server", "macos", "networking", "tcp/ip", "dns", "vpn", "firewall",
  "git", "agile", "scrum", "jira", "rest", "graphql", "api", "microservices", "serverless",
  "automation", "scripting", "azure automation", "power apps", "n8n", "zapier", "devops", "sre", "observability", "monitoring", "grafana", "prometheus",
  "ai", "claude code", "copilot", "prompt engineering", "rag", "agents",
  // Microsoft identity and security. Without these an identity-led posting
  // parsed as "python, azure, cloud" and the plan led with the wrong thesis
  // (AUDIT.md section 2b, F1).
  "entra id", "entra id governance", "identity governance", "conditional access", "pim", "privileged identity management",
  "iam", "zero trust", "sentinel", "kql", "defender", "defender xdr", "defender for endpoint", "defender for identity",
  "defender for cloud", "defender for office 365", "edr", "xdr", "purview", "dlp", "data loss prevention",
  "microsoft graph", "microsoft graph api", "graph api", "ms graph", "mcp",
] as const;

/**
 * Broad umbrella terms. They are still extracted (a posting really does ask
 * for "security"), but they rank below specific requirements in the same
 * section so a commodity word never becomes the role thesis (AUDIT.md F1, F12).
 */
export const GENERIC_SKILL_TERMS: ReadonlySet<string> = new Set([
  "cloud", "security", "ai", "automation", "api", "compliance", "endpoint", "agents", "monitoring", "networking", "agile", "scrum",
]);

/**
 * Equivalence is deliberately opt-in. Similar technologies are not aliases:
 * Docker Swarm does not imply Kubernetes, and GCP does not imply Go.
 */
export const SKILL_ALIAS_GROUPS: readonly SkillAliasGroup[] = [
  {
    key: "entra-id",
    label: "Entra ID",
    terms: ["entra", "entra id", "azure ad", "azure active directory"],
  },
  {
    key: "microsoft-365",
    label: "Microsoft 365",
    terms: ["microsoft 365", "m365", "office 365", "o365"],
  },
  {
    // A profile that says "Google Cloud Platform" made a posting's "GCP" a gap,
    // and the gap check then rejected the abbreviation (owner E2E run).
    key: "google-cloud",
    label: "Google Cloud Platform",
    terms: ["gcp", "google cloud platform", "google cloud"],
  },
  {
    key: "aws",
    label: "AWS",
    terms: ["aws", "amazon web services"],
  },
  {
    key: "pim",
    label: "Privileged Identity Management",
    terms: ["pim", "privileged identity management", "entra pim", "azure ad pim"],
  },
  {
    // Defender XDR is the suite name Microsoft now uses for "Microsoft 365
    // Defender"; postings use the three interchangeably (AUDIT.md section 4.1).
    key: "defender-xdr",
    label: "Microsoft Defender XDR",
    terms: ["defender xdr", "microsoft 365 defender", "defender"],
  },
  {
    key: "microsoft-graph",
    label: "Microsoft Graph",
    terms: ["microsoft graph", "microsoft graph api", "graph api", "ms graph"],
  },
  {
    // "K8s" is the standard abbreviation; without it a label-only Kubernetes
    // could be claimed as "K8s" past LABEL_ONLY_CLAIM (QA, PR #18 B2).
    key: "kubernetes",
    label: "Kubernetes",
    terms: ["kubernetes", "k8s"],
  },
  {
    key: "dlp",
    label: "Data loss prevention",
    terms: ["dlp", "data loss prevention"],
  },
] as const;

export interface SkillImplication {
  /** The broad requirement a posting states. */
  requirement: string;
  /** Concrete skills that satisfy it. One-way: the requirement never implies them. */
  satisfiedBy: readonly string[];
}

/**
 * One-way equivalences. A PowerShell profile meets a "scripting" requirement,
 * but a profile that only says "scripting" does not prove PowerShell. Before
 * this, "scripting" was reported as a gap for a PowerShell-heavy profile and
 * the gap check then blocked the word on the CV (AUDIT.md F12, section 4.1).
 */
export const SKILL_IMPLICATIONS: readonly SkillImplication[] = [
  { requirement: "scripting", satisfiedBy: ["powershell"] },
] as const;

export type SkillMatchType = "exact" | "alias" | "implied";

export function normalizeSkillText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a skill phrase only when it is delimited from surrounding letters and
 * digits. This prevents `go` from matching inside `Google` while allowing
 * punctuation-delimited terms such as `ci/cd`, `c#`, and `.net`.
 */
export function containsSkillTerm(text: string, term: string): boolean {
  const normalizedText = normalizeSkillText(text);
  const normalizedTerm = normalizeSkillText(term);
  if (!normalizedText || !normalizedTerm) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(normalizedTerm)}(?=$|[^\\p{L}\\p{N}])`, "u").test(normalizedText);
}

/** The alias group a term belongs to, if any. */
export function aliasGroupFor(term: string): SkillAliasGroup | undefined {
  const normalized = normalizeSkillText(term);
  return SKILL_ALIAS_GROUPS.find((candidate) => candidate.terms.some((entry) => normalizeSkillText(entry) === normalized));
}

function aliasesFor(requirement: string): readonly string[] {
  return aliasGroupFor(requirement)?.terms ?? [];
}

function implicationsFor(requirement: string): readonly string[] {
  const normalized = normalizeSkillText(requirement);
  return SKILL_IMPLICATIONS.filter((entry) => normalizeSkillText(entry.requirement) === normalized).flatMap((entry) => entry.satisfiedBy);
}

/**
 * Return the reason a concrete profile skill supports a JD requirement, or
 * null when no factual connection exists.
 */
export function matchProfileSkill(requirement: string, profileSkill: string): SkillMatchType | null {
  const normalizedRequirement = normalizeSkillText(requirement);
  if (!normalizedRequirement || !profileSkill.trim()) return null;

  if (containsSkillTerm(profileSkill, normalizedRequirement)) return "exact";
  if (
    aliasesFor(normalizedRequirement).some(
      (alias) => normalizeSkillText(alias) !== normalizedRequirement && containsSkillTerm(profileSkill, alias),
    )
  ) {
    return "alias";
  }
  return implicationsFor(normalizedRequirement).some((skill) => containsSkillTerm(profileSkill, skill)) ? "implied" : null;
}
