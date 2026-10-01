import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TemplateMeta } from "../../src/schemas.js";
import { Profile } from "../../src/profile-schemas.js";
import { professionalExperienceYears } from "../../src/experience.js";
import { ParsedJD, summarizeText } from "../jobs/summarize.js";
import { detectMarket, templateSupportsMarket, type MarketProfile } from "../../src/market-profiles.js";

export type RoleType = "technical" | "leadership" | "creative" | "general";
export type Seniority = "junior" | "mid" | "senior" | "lead" | "executive" | "unknown";

export interface JobSignals {
  sectors: string[];
  /** Full market profile behind `market` — conventions, language, page limits. */
  marketProfile: MarketProfile;
  formality: "formal" | "semi-formal" | "casual";
  market: string;
  rtl: boolean;
  roleType: RoleType;
  seniority: Seniority;
  companySize: "small" | "medium" | "large" | "unknown";
  certifications: string[];
  jd: ParsedJD;
}

export interface ProfileFacts {
  skills: string[];
  years: number | null;
  seniority: Seniority;
  certifications: string[];
  hasPublications: boolean;
  completeness: number;
  missing: string[];
}

export interface FactorScore {
  factor: string;
  weight: number;
  raw: number;
  weighted: number;
  reason: string;
}

export interface TemplateScore {
  name: string;
  type: "cv" | "cover";
  available: boolean;
  score: number;
  factors: FactorScore[];
  warnings: string[];
}

export interface Confidence {
  level: "high" | "medium" | "low";
  score: number;
  reasons: string[];
}

export interface SelectionResult {
  signals: Omit<JobSignals, "jd">;
  profile: Pick<ProfileFacts, "seniority" | "years" | "completeness" | "missing">;
  cv: TemplateScore[];
  cover: TemplateScore[];
  selected: { cv: string | null; cover: string | null };
  confidence: Confidence;
  neutral: string[];
  warnings: string[];
}

const SECTOR_KEYWORDS: Record<string, string[]> = {
  finance: ["bank", "fintech", "finance", "financial", "insurance", "trading", "payments"],
  consulting: ["consulting", "consultancy", "advisory", "professional services"],
  legal: ["legal", "law firm", "compliance officer"],
  government: ["government", "public sector", "municipality", "ministry"],
  healthcare: ["healthcare", "hospital", "medical", "clinical", "medtech"],
  pharma: ["pharma", "biotech", "life sciences"],
  research: ["research institute", "phd", "postdoc", "publications", "academic"],
  university: ["university", "faculty", "lecturer"],
  tech: ["saas", "software company", "tech company", "cloud", "platform", "b2b tech"],
  startup: ["startup", "scale-up", "scaleup", "seed", "series a", "series b", "venture"],
  enterprise: ["enterprise", "fortune", "corporate", "large-scale", "multinational"],
  data: ["data science", "machine learning", "analytics", "nlp", "ml engineer", "ai "],
  engineering: ["devops", "infrastructure", "sre", "platform engineer", "system admin", "it operations", "endpoint"],
  product: ["product manager", "product owner", "product-led"],
  design: ["designer", "ux", "ui design", "brand design"],
  marketing: ["marketing", "seo", "growth", "content strategy"],
  media: ["media", "entertainment", "streaming", "video production"],
};

const CERT_PATTERNS: Array<[string, RegExp]> = [
  ["AWS", /aws certified|aws solutions architect/i],
  ["Azure", /az-\d{3}|azure (administrator|architect|security) (associate|expert)|microsoft certified/i],
  ["M365", /ms-\d{3}|md-\d{3}|modern desktop|m365 certified/i],
  ["GCP", /google cloud certified/i],
  ["CISSP", /\bcissp\b/i],
  ["CISM", /\bcism\b/i],
  ["CompTIA", /comptia|security\+|network\+/i],
  ["CCNA", /\bccna\b|\bccnp\b/i],
  ["Kubernetes", /\bcka\b|\bckad\b|certified kubernetes/i],
  ["Terraform", /terraform (associate|certified)/i],
  ["PMP", /\bpmp\b|prince2/i],
  ["ITIL", /\bitil\b/i],
];

const FORMAL_CUES = /cover letter required|dear hiring|formal application|please submit your application|we offer a professional/i;
const CASUAL_CUES = /\bhey\b|join our awesome|ninja|rockstar|fun team|we're a bunch/i;

export function extractJobSignals(posting: string): JobSignals {
  const lower = posting.toLowerCase();
  const jd = summarizeText(posting);

  const sectors: string[] = [];
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) sectors.push(sector);
  }

  let formality: JobSignals["formality"] = "semi-formal";
  if (FORMAL_CUES.test(posting) || sectors.some((s) => ["finance", "legal", "government", "consulting"].includes(s))) {
    formality = "formal";
  }
  if (CASUAL_CUES.test(posting) && formality !== "formal") formality = "casual";

  const hebrew = /[֐-׿]/.test(posting);
  // Per-country detection lives in src/market-profiles.ts so the drafting model
  // and the template scorer read the same source. Previously Germany, the UK,
  // the Netherlands and Ireland all collapsed into one "eu" bucket, which is
  // exactly where CV conventions diverge most.
  const profile = detectMarket(posting);
  const market = profile.code;

  const rtl = hebrew || (jd.languages ?? []).includes("hebrew");

  let roleType: RoleType = "general";
  if (/head of|director|vp |vice president|chief|cto|ciso|manager of|team lead|engineering manager/i.test(posting)) roleType = "leadership";
  else if (/designer|ux |ui |brand|art director|content creator|illustrator/i.test(posting)) roleType = "creative";
  else if (/engineer|developer|devops|sre|administrator|architect|analyst|specialist|technician/i.test(posting)) roleType = "technical";

  let seniority: Seniority = "unknown";
  if (/intern|graduate|junior|entry.level|student position/i.test(posting)) seniority = "junior";
  else if (/staff engineer|principal|tech lead|team lead|lead engineer/i.test(posting)) seniority = "lead";
  else if (/head of|director|vp |vice president|chief|cto|ciso/i.test(posting)) seniority = "executive";
  else if (/senior|sr\.|\bsr\b/i.test(posting)) seniority = "senior";
  else if (jd.yearsExperience !== null) {
    seniority = jd.yearsExperience >= 8 ? "senior" : jd.yearsExperience >= 3 ? "mid" : "junior";
  }

  let companySize: JobSignals["companySize"] = "unknown";
  if (/startup|scale-up|scaleup|seed|series [ab]/i.test(posting)) companySize = "small";
  else if (/fortune|enterprise|multinational|global leader|10,?000\+? employees/i.test(posting)) companySize = "large";
  else if (/\d{2,3}\+? employees|growing company/i.test(posting)) companySize = "medium";

  const certifications = CERT_PATTERNS.filter(([, re]) => re.test(posting)).map(([name]) => name);

  return { sectors, formality, market, marketProfile: profile, rtl, roleType, seniority, companySize, certifications, jd };
}

export function deriveProfileFacts(profile: Profile | null): ProfileFacts {
  if (!profile) {
    return {
      skills: [],
      years: null,
      seniority: "unknown",
      certifications: [],
      hasPublications: false,
      completeness: 0,
      missing: ["profile not loaded"],
    };
  }

  const skills = (profile.skills ?? []).flatMap((c) => c.skills.map((s) => s.toLowerCase()));

  const years = professionalExperienceYears(profile.experience);

  const seniority: Seniority =
    years === null ? "unknown" : years >= 10 ? "lead" : years >= 6 ? "senior" : years >= 2 ? "mid" : "junior";

  const certifications = (profile.certifications ?? []).map((c: { name?: string } | string) =>
    typeof c === "string" ? c : (c.name ?? "")
  ).filter(Boolean);

  const hasPublications = (profile.education ?? []).some((e) => (e.topics ?? []).length > 0);

  const missing: string[] = [];
  if (skills.length === 0) missing.push("skills");
  if ((profile.experience ?? []).length === 0) missing.push("experience");
  if ((profile.education ?? []).length === 0) missing.push("education");
  if (certifications.length === 0) missing.push("certifications");
  const completeness = Math.round(((4 - missing.length) / 4) * 100) / 100;

  return { skills, years, seniority, certifications, hasPublications, completeness, missing };
}

const FORMALITY_ORDER = ["formal", "semi-formal", "casual"] as const;

const STYLE_FOR_ROLE: Record<RoleType, Record<string, number>> = {
  technical: { modern: 1, conservative: 0.6, creative: 0.3 },
  leadership: { conservative: 1, modern: 0.6, creative: 0.1 },
  creative: { creative: 1, modern: 0.6, conservative: 0.2 },
  general: { modern: 0.7, conservative: 0.7, creative: 0.4 },
};

const STYLE_FOR_SENIORITY: Record<Seniority, Record<string, number>> = {
  junior: { modern: 1, creative: 0.7, conservative: 0.5 },
  mid: { modern: 1, conservative: 0.7, creative: 0.5 },
  senior: { modern: 0.8, conservative: 1, creative: 0.3 },
  lead: { conservative: 1, modern: 0.7, creative: 0.2 },
  executive: { conservative: 1, modern: 0.5, creative: 0.1 },
  unknown: { modern: 0.7, conservative: 0.7, creative: 0.5 },
};

export function scoreTemplate(
  meta: TemplateMeta,
  type: "cv" | "cover",
  available: boolean,
  signals: JobSignals,
  facts: ProfileFacts,
  photoAvailable: boolean
): TemplateScore {
  const factors: FactorScore[] = [];
  const warnings: string[] = [];
  const push = (factor: string, weight: number, raw: number, reason: string) => {
    const bounded = Math.max(0, Math.min(1, raw));
    factors.push({ factor, weight, raw: bounded, weighted: Math.round(bounded * weight * 1000) / 1000, reason });
  };

  if (signals.sectors.length === 0) {
    push("sector", 0.25, 0.5, "neutral — no sector signal detected in posting");
  } else {
    const overlap = meta.sectors.filter((s) => signals.sectors.includes(s));
    const raw = overlap.length / Math.min(signals.sectors.length, meta.sectors.length) || 0;
    push(
      "sector",
      0.25,
      raw,
      overlap.length > 0 ? `matches ${overlap.join(", ")}` : `no overlap (posting: ${signals.sectors.join(", ")})`
    );
  }

  const dist = Math.abs(FORMALITY_ORDER.indexOf(meta.formality) - FORMALITY_ORDER.indexOf(signals.formality));
  push("formality", 0.2, dist === 0 ? 1 : dist === 1 ? 0.5 : 0, `template ${meta.formality} vs posting ${signals.formality}`);

  if (signals.market === "unknown") {
    push("market", 0.2, 0.5, "neutral — market not detected");
  } else {
    // Match on the exact country OR its region, so a template written before
    // per-country profiles (markets: ["eu"]) still scores full marks for a
    // German or Irish posting instead of dropping to the 0.25 miss score.
    const supported = templateSupportsMarket(meta.markets, signals.marketProfile);
    let raw = supported ? 1 : 0.25;
    let reason = supported
      ? `supports ${signals.market}`
      : `${signals.market} not in supported markets (${meta.markets.join(", ")})`;
    if (signals.rtl && !meta.features.includes("rtl_support")) {
      raw = 0;
      reason = "Hebrew/RTL posting but template lacks rtl_support";
      warnings.push(`${meta.name}: no RTL support for Hebrew posting`);
    }
    push("market", 0.2, raw, reason);
  }

  push("role_fit", 0.15, STYLE_FOR_ROLE[signals.roleType][meta.style] ?? 0.5, `${meta.style} style for ${signals.roleType} role`);

  const senioritySource = signals.seniority !== "unknown" ? signals.seniority : facts.seniority;
  push(
    "seniority_fit",
    0.1,
    STYLE_FOR_SENIORITY[senioritySource][meta.style] ?? 0.5,
    senioritySource === "unknown"
      ? "neutral — seniority unknown from posting and profile"
      : `${meta.style} style for ${senioritySource} level`
  );

  let profileRaw = 0.5;
  const profileReasons: string[] = [];
  const photoRequired = meta.assets?.photo?.required ?? false;
  if (photoRequired && !photoAvailable) {
    profileRaw -= 0.4;
    profileReasons.push("photo required but none staged");
    warnings.push(`${meta.name}: requires photo, none available in assets/photos/`);
  }
  if (meta.features.includes("publications")) {
    profileRaw += facts.hasPublications ? 0.3 : -0.2;
    profileReasons.push(facts.hasPublications ? "publications section usable" : "publications section would sit empty");
  }
  if (meta.features.includes("skill_bars") && facts.skills.length >= 6) {
    profileRaw += 0.2;
    profileReasons.push(`skill_bars fit ${facts.skills.length} profile skills`);
  }
  if (signals.certifications.length > 0 && meta.style === "conservative") {
    profileRaw += 0.2;
    profileReasons.push(`cert-heavy posting (${signals.certifications.join(", ")}) favors conservative layout`);
  }
  push("profile_fit", 0.1, profileRaw, profileReasons.join("; ") || "neutral — no profile-specific pull");

  const total = factors.reduce((sum, f) => sum + f.weighted, 0);
  const maxTotal = factors.reduce((sum, f) => sum + f.weight, 0);
  const score = Math.round((total / maxTotal) * 100);

  if (!available) warnings.push(`${meta.name}: stub — meta.json exists but template.typ not built`);

  return { name: meta.name, type, available, score, factors, warnings };
}

export interface RegistryEntry {
  meta: TemplateMeta;
  type: "cv" | "cover";
  available: boolean;
}

export function loadRegistry(templatesDir: string): RegistryEntry[] {
  const entries: RegistryEntry[] = [];
  for (const type of ["cv", "cover"] as const) {
    const dir = join(templatesDir, type);
    if (!existsSync(dir)) continue;
    for (const sub of readdirSync(dir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const metaPath = join(dir, sub.name, "meta.json");
      if (!existsSync(metaPath)) continue;
      try {
        const meta = TemplateMeta.parse(JSON.parse(readFileSync(metaPath, "utf-8")));
        const available = existsSync(join(dir, sub.name, meta.source));
        entries.push({ meta, type, available });
      } catch (e) {
        process.stderr.write(JSON.stringify({ warning: `invalid meta.json in ${type}/${sub.name}: ${e}` }) + "\n");
      }
    }
  }
  return entries;
}

export function selectTemplates(
  posting: string,
  profile: Profile | null,
  registry: RegistryEntry[],
  options: { photoAvailable?: boolean; includeStubs?: boolean; override?: string } = {}
): SelectionResult {
  const signals = extractJobSignals(posting);
  const facts = deriveProfileFacts(profile);
  const photoAvailable = options.photoAvailable ?? false;

  const scored = registry.map((r) => scoreTemplate(r.meta, r.type, r.available, signals, facts, photoAvailable));
  const cv = scored.filter((s) => s.type === "cv").sort((a, b) => b.score - a.score);
  const cover = scored.filter((s) => s.type === "cover").sort((a, b) => b.score - a.score);

  const warnings: string[] = [];
  const pick = (ranked: TemplateScore[]): string | null => {
    if (options.override && ranked.some((r) => r.name === options.override)) return options.override;
    const eligible = options.includeStubs ? ranked : ranked.filter((r) => r.available);
    const top = eligible[0] ?? null;
    if (top && ranked[0] && ranked[0].name !== top.name) {
      warnings.push(`top-ranked '${ranked[0].name}' (${ranked[0].score}) is a stub — selected '${top.name}' (${top.score}) instead`);
    }
    return top?.name ?? null;
  };

  const neutral = scored
    .flatMap((s) => s.factors.filter((f) => f.reason.startsWith("neutral")).map((f) => `${s.name}:${f.factor}`))
    .filter((v, i, a) => a.indexOf(v) === i);

  const signalStrength =
    [
      signals.sectors.length > 0,
      signals.market !== "unknown",
      signals.seniority !== "unknown",
      signals.roleType !== "general",
      signals.companySize !== "unknown",
    ].filter(Boolean).length / 5;
  const confScore = Math.round((signalStrength * 0.6 + facts.completeness * 0.4) * 100) / 100;
  const reasons: string[] = [];
  reasons.push(`posting signal strength ${Math.round(signalStrength * 100)}%`);
  reasons.push(`profile completeness ${Math.round(facts.completeness * 100)}%${facts.missing.length ? ` (missing: ${facts.missing.join(", ")})` : ""}`);
  const confidence: Confidence = {
    level: confScore >= 0.7 ? "high" : confScore >= 0.4 ? "medium" : "low",
    score: confScore,
    reasons,
  };

  const { jd: _jd, ...signalsOut } = signals;
  return {
    signals: signalsOut,
    profile: { seniority: facts.seniority, years: facts.years, completeness: facts.completeness, missing: facts.missing },
    cv,
    cover,
    selected: { cv: pick(cv), cover: pick(cover) },
    confidence,
    neutral,
    warnings: [...warnings, ...scored.flatMap((s) => s.warnings)],
  };
}
