export interface CvLayoutOption {
  id: string;
  name: string;
  description: string;
  bestFor: string[];
  avoidFor: string[];
  density: "compact" | "balanced" | "roomy";
  accent: string;
  supportsAvatar: boolean;
}

export const CV_LAYOUTS: CvLayoutOption[] = [
  { id: "modern", name: "Modern", description: "Balanced single-column ATS layout with grouped skills.", bestFor: ["technology", "product", "data", "engineering"], avoidFor: [], density: "balanced", accent: "blue", supportsAvatar: true },
  { id: "ats-compact", name: "ATS Compact", description: "Tighter margins and leading for dense, technical CVs.", bestFor: ["engineering", "technical", "security", "infrastructure"], avoidFor: ["design", "creative"], density: "compact", accent: "blue", supportsAvatar: true },
  { id: "executive", name: "Executive", description: "Larger name treatment and restrained senior layout.", bestFor: ["executive", "leadership", "consulting", "management"], avoidFor: ["entry-level"], density: "roomy", accent: "navy", supportsAvatar: true },
  { id: "technical", name: "Technical", description: "Dense evidence-first layout for technical hiring managers.", bestFor: ["engineering", "security", "platform", "devops"], avoidFor: ["creative", "marketing"], density: "compact", accent: "teal", supportsAvatar: true },
  { id: "minimal", name: "Minimal", description: "Quiet single-column layout with no decorative emphasis.", bestFor: ["research", "legal", "government", "academic"], avoidFor: ["creative", "sales"], density: "balanced", accent: "slate", supportsAvatar: false },
  { id: "swiss-grid", name: "Swiss Grid", description: "Structured grid discipline with strong alignment and rules.", bestFor: ["consulting", "finance", "enterprise", "operations"], avoidFor: ["casual"], density: "balanced", accent: "blue", supportsAvatar: false },
  { id: "classic", name: "Classic", description: "Traditional conservative structure for formal applications.", bestFor: ["finance", "legal", "government", "academic"], avoidFor: ["startup", "creative"], density: "roomy", accent: "navy", supportsAvatar: false },
  { id: "project-first", name: "Project First", description: "Places project evidence immediately after the profile summary.", bestFor: ["portfolio", "product", "research", "consulting"], avoidFor: ["traditional finance"], density: "balanced", accent: "indigo", supportsAvatar: true },
  { id: "creative", name: "Creative", description: "More expressive accent and spacing while staying ATS-readable.", bestFor: ["design", "marketing", "media", "content"], avoidFor: ["legal", "finance"], density: "roomy", accent: "purple", supportsAvatar: true },
  { id: "resume-compact", name: "Resume Compact", description: "Maximum information density for experienced technical candidates.", bestFor: ["engineering", "security", "operations"], avoidFor: ["design", "academic"], density: "compact", accent: "teal", supportsAvatar: false },
];

export interface LayoutRecommendation {
  recommended: string;
  options: Array<{ id: string; score: number; reasons: string[] }>;
}

export function recommendCvLayout(input: {
  role: string;
  market: string;
  posting: string;
  seniority?: string;
}): LayoutRecommendation {
  const role = input.role.toLowerCase();
  const posting = input.posting.toLowerCase();
  const market = input.market.toLowerCase();
  const text = `${role} ${posting}`;
  const options = CV_LAYOUTS.map((option) => {
    let score = 50;
    const reasons: string[] = [];
    for (const term of option.bestFor) {
      if (text.includes(term)) {
        score += 18;
        reasons.push(`matches ${term}`);
      }
    }
    for (const term of option.avoidFor) {
      if (text.includes(term)) {
        score -= 30;
        reasons.push(`not ideal for ${term}`);
      }
    }
    if (input.seniority === "senior" || input.seniority === "lead" || input.seniority === "executive") {
      if (["executive", "swiss-grid", "classic"].includes(option.id)) { score += 12; reasons.push("senior role benefits from restrained hierarchy"); }
      if (["resume-compact", "ats-compact"].includes(option.id)) { score -= 6; reasons.push("very dense layout may understate seniority"); }
    }
    if (["us", "uk", "ie"].includes(market) && option.id === "ats-compact") { score += 10; reasons.push("ATS-first market"); }
    if (["de", "at", "ch"].includes(market) && option.id === "classic") { score += 8; reasons.push("formal market convention"); }
    if (option.density === "compact" && posting.includes("senior") === false) score += 3;
    return { id: option.id, score: Math.max(0, Math.min(100, score)), reasons: reasons.length ? reasons : ["balanced default"] };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return { recommended: options[0].id, options: options.slice(0, 5) };
}
