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
] as const;

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
] as const;

export type SkillMatchType = "exact" | "alias";

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

function aliasesFor(requirement: string): readonly string[] {
  const normalizedRequirement = normalizeSkillText(requirement);
  const group = SKILL_ALIAS_GROUPS.find((candidate) =>
    candidate.terms.some((term) => normalizeSkillText(term) === normalizedRequirement),
  );
  return group?.terms ?? [];
}

/**
 * Return the reason a concrete profile skill supports a JD requirement, or
 * null when no factual connection exists.
 */
export function matchProfileSkill(requirement: string, profileSkill: string): SkillMatchType | null {
  const normalizedRequirement = normalizeSkillText(requirement);
  if (!normalizedRequirement || !profileSkill.trim()) return null;

  if (containsSkillTerm(profileSkill, normalizedRequirement)) return "exact";
  return aliasesFor(normalizedRequirement).some(
    (alias) => normalizeSkillText(alias) !== normalizedRequirement && containsSkillTerm(profileSkill, alias),
  )
    ? "alias"
    : null;
}
