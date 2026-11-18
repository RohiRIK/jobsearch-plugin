/**
 * Requirement → evidence matrix (AUDIT.md §4.1, F3-F8).
 *
 * For each ranked posting requirement (`ParsedJD.requirements`, rank 1 first),
 * list the specific profile lines that prove it, strongest first, or mark it
 * as a gap. The writer drafts from these rows instead of from the whole
 * profile, and the plan's evidence priorities are keyed to individual lines,
 * so one role is no longer listed once per matched skill (F8).
 *
 * Strength order: direct-work (a responsibility, achievement or role header)
 * > work-project > personal-project > credential (certification, education)
 * > skill-label-only. A saved skill label is not evidence of work
 * (cv/SKILL.md), so a requirement backed only by a label is `label-only`:
 * not a gap, but never proof for a skills line or a bullet.
 *
 * Deterministic and offline. Requirement terms come from the bounded parser
 * vocabulary and evidence text from the candidate's own profile; posting text
 * only rides along as each row's `quote`.
 */
import type { Profile } from "./profile-schemas.js";
import type { EvidenceItem } from "./application-draft.js";
import type { ParsedJD, RankedRequirement, RequirementSection } from "../scripts/jobs/summarize.js";
import { matchProfileSkill, normalizeSkillText, type SkillMatchType } from "./skill-vocabulary.js";

export type EvidenceStrength = "direct-work" | "work-project" | "personal-project" | "credential" | "skill-label-only";
export type MatrixStatus = "proven" | "label-only" | "gap";
export type MatrixUse = "headline" | "summary" | "skills" | "experience" | "projects" | "certifications";

export const STRENGTH_ORDER: readonly EvidenceStrength[] = ["direct-work", "work-project", "personal-project", "credential", "skill-label-only"];

export interface MatrixEvidence {
  evidenceId: string;
  strength: EvidenceStrength;
  matchType: SkillMatchType;
  /** profile.experience index for role lines and employer-linked projects; null otherwise. */
  experienceIndex: number | null;
}

export interface MatrixRow {
  requirement: string;
  rank: number;
  weight: number;
  section: RequirementSection;
  required: boolean;
  generic: boolean;
  /** Posting line the requirement came from. Untrusted posting text. */
  quote: string;
  status: MatrixStatus;
  /** Strongest evidence class found; null for a gap. */
  strength: EvidenceStrength | null;
  /** Best evidence first, at most MAX_EVIDENCE_PER_ROW. Empty for a gap. */
  evidence: MatrixEvidence[];
  /** CV sections this row may support. Empty for gaps and label-only rows. */
  use: MatrixUse[];
}

export interface EvidenceLineUse {
  evidenceId: string;
  strength: EvidenceStrength;
  experienceIndex: number | null;
  /** Requirements this line proves, in posting rank order. */
  requirements: string[];
  /** Rank of the most important requirement it proves. */
  bestRank: number;
}

export interface EvidenceMatrix {
  rows: MatrixRow[];
  /** Requirements with no profile evidence at all, rank order. Never claimable. */
  gaps: string[];
  /** Requirements backed only by a saved skill label, rank order. */
  labelOnly: string[];
  /** Each proving line once, ordered by the best requirement it proves. Replaces role-level priorities (F8). */
  lines: EvidenceLineUse[];
}

/** Rows kept in the matrix. The posting's lower-ranked terms add prompt length, not signal. */
export const MAX_MATRIX_ROWS = 30;
export const MAX_EVIDENCE_PER_ROW = 5;

interface Candidate {
  id: string;
  strength: EvidenceStrength;
  /** Lower is better inside one strength class: achievements before responsibilities before headers. */
  order: number;
  experienceIndex: number | null;
  text: string;
}

function classify(item: EvidenceItem, projectKinds: Map<string, "work" | "personal">): Candidate | null {
  if (item.source !== "profile") return null;
  const text = normalizeSkillText(item.text);
  const roleLine = /^profile:experience:(\d+)(?::(responsibility|achievement):\d+)?$/.exec(item.id);
  if (roleLine) {
    const order = roleLine[2] === "achievement" ? 0 : roleLine[2] === "responsibility" ? 1 : 2;
    return { id: item.id, strength: "direct-work", order, experienceIndex: Number(roleLine[1]), text };
  }
  if (item.kind === "project") {
    const kind = projectKinds.get(item.id) ?? "personal";
    const engaged = typeof item.engagement === "number" ? item.engagement : null;
    return { id: item.id, strength: kind === "work" ? "work-project" : "personal-project", order: engaged === null ? 1 : 0, experienceIndex: engaged, text };
  }
  if (item.kind === "certification" || item.kind === "education") return { id: item.id, strength: "credential", order: 0, experienceIndex: null, text };
  if (item.kind === "skill") return { id: item.id, strength: "skill-label-only", order: 0, experienceIndex: null, text };
  // Identity lines (headline, location, work authorization) are self-description, not proof.
  return null;
}

function useFor(strength: EvidenceStrength, rank: number): MatrixUse[] {
  switch (strength) {
    case "direct-work":
      return rank <= 3 ? ["headline", "summary", "skills", "experience"] : ["summary", "skills", "experience"];
    case "work-project":
      return ["skills", "projects"];
    case "personal-project":
      return ["skills", "projects"];
    case "credential":
      return ["certifications"];
    default:
      return [];
  }
}

/** Requirements in rank order; parsed JSON from before `requirements[]` existed falls back to the skill lists. */
function rankedRequirements(jd: Pick<ParsedJD, "requirements" | "requiredSkills" | "niceToHaveSkills">): RankedRequirement[] {
  if (jd.requirements?.length) return [...jd.requirements].sort((a, b) => a.rank - b.rank);
  const fallback: RankedRequirement[] = [];
  for (const term of jd.requiredSkills ?? []) fallback.push({ term, rank: fallback.length + 1, weight: 0.8, section: "required", required: true, generic: false, position: -1, quote: "" });
  for (const term of jd.niceToHaveSkills ?? []) fallback.push({ term, rank: fallback.length + 1, weight: 0.3, section: "nice-to-have", required: false, generic: false, position: -1, quote: "" });
  return fallback;
}

export function buildEvidenceMatrix(input: {
  jd: Pick<ParsedJD, "requirements" | "requiredSkills" | "niceToHaveSkills">;
  evidence: EvidenceItem[];
  profile: Pick<Profile, "projects">;
}): EvidenceMatrix {
  const projectKinds = new Map<string, "work" | "personal">();
  for (const project of input.profile.projects ?? []) projectKinds.set(`profile:project:${project.slug.replace(/[^a-z0-9_-]/g, "-")}`, project.kind);
  const candidates = input.evidence.map((item) => classify(item, projectKinds)).filter((item): item is Candidate => item !== null);

  const rows: MatrixRow[] = [];
  const gaps: string[] = [];
  const labelOnly: string[] = [];
  const seen = new Set<string>();
  for (const requirement of rankedRequirements(input.jd)) {
    const key = normalizeSkillText(requirement.term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const found: Array<MatrixEvidence & { order: number }> = [];
    for (const candidate of candidates) {
      const matchType = matchProfileSkill(requirement.term, candidate.text);
      if (matchType) found.push({ evidenceId: candidate.id, strength: candidate.strength, matchType, experienceIndex: candidate.experienceIndex, order: candidate.order });
    }
    found.sort((a, b) => STRENGTH_ORDER.indexOf(a.strength) - STRENGTH_ORDER.indexOf(b.strength) || a.order - b.order);
    const strength = found[0]?.strength ?? null;
    const status: MatrixStatus = strength === null ? "gap" : strength === "skill-label-only" ? "label-only" : "proven";
    if (status === "gap") gaps.push(requirement.term);
    if (status === "label-only") labelOnly.push(requirement.term);
    if (rows.length >= MAX_MATRIX_ROWS) continue;
    rows.push({
      requirement: requirement.term,
      rank: requirement.rank,
      weight: requirement.weight,
      section: requirement.section,
      required: requirement.required,
      generic: requirement.generic,
      quote: requirement.quote,
      status,
      strength,
      evidence: found.slice(0, MAX_EVIDENCE_PER_ROW).map(({ order: _order, ...rest }) => rest),
      use: status === "proven" && strength ? useFor(strength, requirement.rank) : [],
    });
  }

  const byLine = new Map<string, EvidenceLineUse>();
  for (const row of rows) {
    if (row.status !== "proven") continue;
    for (const item of row.evidence) {
      if (item.strength === "skill-label-only" || item.strength === "credential") continue;
      const existing = byLine.get(item.evidenceId);
      if (existing) {
        if (!existing.requirements.includes(row.requirement)) existing.requirements.push(row.requirement);
        existing.bestRank = Math.min(existing.bestRank, row.rank);
      } else {
        byLine.set(item.evidenceId, { evidenceId: item.evidenceId, strength: item.strength, experienceIndex: item.experienceIndex, requirements: [row.requirement], bestRank: row.rank });
      }
    }
  }
  const lines = [...byLine.values()].sort(
    (a, b) => a.bestRank - b.bestRank || STRENGTH_ORDER.indexOf(a.strength) - STRENGTH_ORDER.indexOf(b.strength) || b.requirements.length - a.requirements.length || a.evidenceId.localeCompare(b.evidenceId),
  );
  return { rows, gaps, labelOnly, lines };
}

/** Rows whose best evidence is direct work, rank order. The thesis and summary lead with these. */
export function directWorkRequirements(matrix: EvidenceMatrix): string[] {
  return matrix.rows.filter((row) => row.strength === "direct-work").map((row) => row.requirement);
}
