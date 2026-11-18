/** Draft sections the critic scores and the regeneration loop can rewrite one at a time. */
export const CRITIQUE_SECTIONS = ["headline", "summary", "skills", "experience", "projects", "coverLetter"] as const;
export type CritiqueSection = (typeof CRITIQUE_SECTIONS)[number] | "document";

/** The section a review finding belongs to, from its path ("cv.experience.0.bullets.1" → experience). */
export function sectionOfPath(path: string | undefined): CritiqueSection {
  if (!path) return "document";
  const match = /^(?:cv\.(headline|summary|skills|experience|projects)|(coverLetter))(?:\.|$)/.exec(path);
  return ((match?.[1] ?? match?.[2]) as CritiqueSection | undefined) ?? "document";
}
