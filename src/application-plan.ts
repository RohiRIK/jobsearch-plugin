import type { Profile } from "./profile-schemas.js";
import type { MatchResult } from "../scripts/match/score-job.js";
import type { ParsedJD } from "../scripts/jobs/summarize.js";
import { containsPhrase, detectJobDomains, selectProjects } from "./project-matching.js";

export type EvidenceClass = "professional-experience" | "work-project" | "personal-project" | "supporting-skill";

export interface EvidencePriority {
  evidenceId: string;
  kind: "experience" | "project" | "skill";
  classification: EvidenceClass;
  priority: number;
  reason: string;
  use: string;
}

export interface ProjectDecision {
  slug: string;
  classification: EvidenceClass;
  priority: number;
  included: boolean;
  reason: string;
  interviewPrompts: string[];
}

export interface ApplicationPlan {
  roleThesis: string;
  mustProve: string[];
  evidencePriorities: EvidencePriority[];
  projectDecisions: ProjectDecision[];
  sectionOrder: Array<"summary" | "experience" | "projects" | "education" | "certifications">;
  contentBudget: { summaryWords: [number, number]; experienceRoles: number; projects: number; cvPages: [number, number] };
}

function projectClassification(project: { kind: "work" | "personal" }): EvidenceClass {
  return project.kind === "work" ? "work-project" : "personal-project";
}

function experienceText(experience: NonNullable<Profile["experience"]>[number]): string {
  return [experience.title, experience.company, ...(experience.responsibilities ?? []), ...(experience.achievements ?? [])]
    .filter(Boolean)
    .join(" ");
}

function rankExperience(profile: Profile, jd: ParsedJD): Array<{ index: number; score: number; matchedSkills: string[] }> {
  const required = [...jd.requiredSkills, ...jd.niceToHaveSkills].map((skill) => skill.toLowerCase());
  return (profile.experience ?? [])
    .map((experience, index) => {
      const text = experienceText(experience).toLowerCase();
      const matchedSkills = required.filter((skill) => containsPhrase(text, skill));
      const achievementBonus = (experience.achievements?.length ?? 0) > 0 ? 1 : 0;
      return { index, score: matchedSkills.length * 3 + achievementBonus, matchedSkills };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Build the inspectable strategy that precedes prose generation. */
export function buildApplicationPlan(input: {
  profile: Profile;
  posting: string;
  role: string;
  jd: ParsedJD;
  score: MatchResult;
  cvPages: [number, number];
  educationFirst: boolean;
}): ApplicationPlan {
  const domains = detectJobDomains(`${input.role}\n${input.posting}`);
  const required = input.jd.requiredSkills.slice(0, 5);
  const nice = input.jd.niceToHaveSkills.slice(0, 3);
  const mustProve = [...required, ...nice].map(titleCase);
  const rankedExperience = rankExperience(input.profile, input.jd);
  const projectRouting = `${input.role}\n${input.posting}`;
  const projects = input.profile.projects ?? [];
  const disclosureBlocked = projects.filter((project) => project.disclosure === "restricted" || project.disclosure === "unreviewed");
  const projectSelection = selectProjects(projects.filter((project) => !disclosureBlocked.includes(project)), projectRouting, { limit: 4 });
  const priorities: EvidencePriority[] = [];
  let priority = 1;

  for (const item of rankedExperience.slice(0, 4)) {
    const experience = input.profile.experience![item.index];
    priorities.push({
      evidenceId: `profile:experience:${item.index}`,
      kind: "experience",
      classification: "professional-experience",
      priority: priority++,
      reason: item.matchedSkills.length
        ? `Matches ${item.matchedSkills.slice(0, 4).join(", ")}`
        : "Provides professional delivery context",
      use: "summary, experience bullets, and interview examples",
    });
    for (const skill of item.matchedSkills.slice(0, 3)) {
      priorities.push({
        evidenceId: `profile:experience:${item.index}`,
        kind: "experience",
        classification: "professional-experience",
        priority: priority++,
        reason: `Role requirement matched by ${experience.title}: ${skill}`,
        use: "skills context and tailored bullet",
      });
    }
  }

  for (const match of projectSelection.selected) {
    priorities.push({
      evidenceId: `profile:project:${match.project.slug}`,
      kind: "project",
      classification: projectClassification(match.project),
      priority: priority++,
      reason: match.reason,
      use: "project section and interview example",
    });
  }

  const projectDecisions: ProjectDecision[] = projectSelection.selected.map((match, index) => ({
    slug: match.project.slug,
    classification: projectClassification(match.project),
    priority: index + 1,
    included: true,
    reason: match.reason,
    interviewPrompts: (match.project.interviewStories ?? []).map((story) => story.question),
  }));
  for (const match of projectSelection.rejected) {
    projectDecisions.push({
      slug: match.project.slug,
      classification: projectClassification(match.project),
      priority: projectDecisions.length + 1,
      included: false,
      reason: match.excludedBecause ?? `below relevance threshold (${match.score})`,
      interviewPrompts: (match.project.interviewStories ?? []).map((story) => story.question),
    });
  }
  for (const project of disclosureBlocked) {
    projectDecisions.push({
      slug: project.slug,
      classification: projectClassification(project),
      priority: projectDecisions.length + 1,
      included: false,
      reason: project.disclosure === "restricted" ? "restricted from CV and interview use" : "awaiting candidate disclosure approval",
      interviewPrompts: [],
    });
  }

  const topReason = mustProve[0] ?? domains[0] ?? input.role;
  const roleThesis = `Lead with verified evidence that proves ${topReason} for this ${input.role}; keep supporting evidence below it.`;
  const sectionOrder: ApplicationPlan["sectionOrder"] = input.educationFirst
    ? ["summary", "education", "experience", "projects", "certifications"]
    : (input.profile.projects?.length && projectSelection.selected.length ? ["summary", "experience", "projects", "education", "certifications"] : ["summary", "experience", "education", "certifications"]);

  return {
    roleThesis,
    mustProve,
    evidencePriorities: priorities,
    projectDecisions,
    sectionOrder,
    contentBudget: {
      summaryWords: [40, 65],
      experienceRoles: Math.min(4, Math.max(1, rankedExperience.length || 1)),
      projects: Math.min(2, projectSelection.selected.length),
      cvPages: input.cvPages,
    },
  };
}
