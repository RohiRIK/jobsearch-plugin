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

/**
 * CV templates the application renderer can fill (`application render`). Other
 * templates under templates/cv take a different input shape (banking takes free
 * sections) and are used directly, not through the evidence-grounded renderer.
 */
export const RENDERABLE_CV_TEMPLATES = ["modern"] as const;

/**
 * Layouts of the modern template. Each id has its own row in the template's
 * `styles` table and renders visibly differently; tests/cv-layouts.test.ts
 * fails if two ids produce the same page, so a new id cannot silently alias.
 */
export const CV_LAYOUTS: CvLayoutOption[] = [
  { id: "modern", name: "Modern", description: "Balanced single-column ATS layout with grouped skills and a shaded profile.", bestFor: ["technology", "product", "data", "engineering"], avoidFor: [], density: "balanced", accent: "blue", supportsAvatar: true },
  { id: "ats-compact", name: "ATS Compact", description: "Modern styling with tighter margins and leading.", bestFor: ["engineering", "technical", "security", "infrastructure"], avoidFor: ["design", "creative"], density: "compact", accent: "blue", supportsAvatar: true },
  { id: "executive", name: "Executive", description: "Larger name, navy accent and en-dash bullets for a restrained senior look.", bestFor: ["executive", "leadership", "consulting", "management"], avoidFor: ["entry-level"], density: "roomy", accent: "navy", supportsAvatar: true },
  { id: "technical", name: "Technical", description: "Compact spacing with a teal accent for dense technical evidence.", bestFor: ["engineering", "security", "platform", "devops"], avoidFor: ["creative", "marketing"], density: "compact", accent: "teal", supportsAvatar: true },
  { id: "minimal", name: "Minimal", description: "No rules or shading: plain slate headings and en-dash bullets.", bestFor: ["research", "legal", "government", "academic"], avoidFor: ["creative", "sales"], density: "balanced", accent: "slate", supportsAvatar: false },
  { id: "swiss-grid", name: "Swiss Grid", description: "Black uppercase headings under heavy rules, Swiss typographic style.", bestFor: ["consulting", "finance", "enterprise", "operations"], avoidFor: ["casual"], density: "balanced", accent: "blue", supportsAvatar: false },
  { id: "classic", name: "Classic", description: "Navy uppercase headings over thin rules, no shading; conservative.", bestFor: ["finance", "legal", "government", "academic"], avoidFor: ["startup", "creative"], density: "roomy", accent: "navy", supportsAvatar: false },
  { id: "project-first", name: "Project First", description: "Modern styling with portfolio projects directly under the summary.", bestFor: ["portfolio", "product", "research", "consulting"], avoidFor: ["traditional finance"], density: "balanced", accent: "indigo", supportsAvatar: true },
  { id: "creative", name: "Creative", description: "Purple accent and roomier line spacing while staying ATS-readable.", bestFor: ["design", "marketing", "media", "content"], avoidFor: ["legal", "finance"], density: "roomy", accent: "purple", supportsAvatar: true },
  { id: "resume-compact", name: "Resume Compact", description: "Tightest margins, 9 pt body and a smaller name for maximum density.", bestFor: ["engineering", "security", "operations"], avoidFor: ["design", "academic"], density: "compact", accent: "teal", supportsAvatar: false },
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
