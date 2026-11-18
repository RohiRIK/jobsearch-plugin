import type { Profile } from "./profile-schemas.js";
import type { MatchResult } from "../scripts/match/score-job.js";
import type { ParsedJD } from "../scripts/jobs/summarize.js";
import { containsPhrase, detectJobDomains, selectProjects } from "./project-matching.js";
import { directWorkRequirements, type EvidenceMatrix } from "./evidence-matrix.js";

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
  /** Top posting requirements the candidate's evidence supports. */
  mustProve: string[];
  /** Top posting requirements the evidence does not support: disclose or bridge, never prove. Must-haves first. */
  openGaps: string[];
  /** Severity of each open gap: a missing must-have outweighs a missing nice-to-have. */
  gapDetails: Array<{ requirement: string; severity: "must-have" | "nice-to-have" }>;
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

/** Most role lines listed per experience entry in evidencePriorities. */
const MAX_LINES_PER_ROLE = 4;

function joinTerms(terms: string[]): string {
  return terms.length <= 1 ? (terms[0] ?? "") : `${terms.slice(0, -1).join(", ")} and ${terms[terms.length - 1]}`;
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
  /**
   * Requirement → evidence matrix over the same ledger. When given, evidence
   * priorities name individual lines (each once) and a requirement the
   * matrix proves from work evidence is not a gap even without a skill label.
   */
  matrix?: EvidenceMatrix;
}): ApplicationPlan {
  const domains = detectJobDomains(`${input.role}\n${input.posting}`);
  const required = input.jd.requiredSkills.slice(0, 5);
  const nice = input.jd.niceToHaveSkills.slice(0, 3);
  // A requirement the scorer lists as a gap is not something the application
  // can prove. Putting it in mustProve, and so in the thesis, told the writer to
  // demonstrate Rails mastery with no Rails evidence (issue #12).
  //
  // Required and nice-to-have skills arrive in posting rank order, so
  // mustProve[0] is the posting's top supported requirement, not whichever
  // term came first in the vocabulary (AUDIT.md F1). A missed nice-to-have is
  // a gap too: before, Kubernetes/Terraform landed in mustProve with no
  // evidence and the writer padded around them (AUDIT.md F2).
  const gapSet = new Set(input.score.gaps.map((gap) => gap.toLowerCase()));
  const niceGapSet = new Set((input.score.niceGaps ?? []).map((gap) => gap.toLowerCase()));
  // The scorer only reads skill labels. A requirement that a responsibility,
  // achievement, project or certification proves is supported evidence, not a
  // gap; one backed by nothing at all stays a gap.
  const provenByWork = new Set(
    (input.matrix?.rows ?? []).filter((row) => row.status === "proven").map((row) => row.requirement.toLowerCase()),
  );
  const isGap = (skill: string) => gapSet.has(skill.toLowerCase()) && !provenByWork.has(skill.toLowerCase());
  const isNiceGap = (skill: string) => niceGapSet.has(skill.toLowerCase()) && !provenByWork.has(skill.toLowerCase());
  // A requirement backed only by a saved skill label is not proven either: the
  // writer is told to keep it out of the CV, so it cannot be a thing to prove.
  const labelOnly = new Set((input.matrix?.labelOnly ?? []).map((term) => term.toLowerCase()));
  const provable = (skill: string) => !labelOnly.has(skill.toLowerCase());
  const mustProve = [...required.filter((skill) => !isGap(skill) && provable(skill)), ...nice.filter((skill) => !isNiceGap(skill) && provable(skill))].map(titleCase);
  const gapDetails: ApplicationPlan["gapDetails"] = [
    ...required.filter(isGap).map((skill) => ({ requirement: titleCase(skill), severity: "must-have" as const })),
    ...nice.filter(isNiceGap).map((skill) => ({ requirement: titleCase(skill), severity: "nice-to-have" as const })),
  ];
  const openGaps = gapDetails.map((gap) => gap.requirement);
  const rankedExperience = rankExperience(input.profile, input.jd);
  const projectRouting = `${input.role}\n${input.posting}`;
  const projects = input.profile.projects ?? [];
  const disclosureBlocked = projects.filter((project) => project.disclosure === "restricted" || project.disclosure === "unreviewed");
  const projectSelection = selectProjects(projects.filter((project) => !disclosureBlocked.includes(project)), projectRouting, { limit: 4 });
  const priorities: EvidencePriority[] = [];
  let priority = 1;

  // Each evidence ID appears once (AUDIT.md F8). The role header used to be
  // repeated once per matched skill ("matched by ...: powershell", "...: azure"),
  // so the writer could not tell which line proved which requirement. Now the
  // header carries the role context once, followed by the specific lines the
  // evidence matrix ties to requirements, best-ranked first.
  const linesByRole = new Map<number, NonNullable<ApplicationPlan["evidencePriorities"]>>();
  const topDirect = new Set((input.matrix ? directWorkRequirements(input.matrix) : []).slice(0, 3).map((term) => term.toLowerCase()));
  for (const line of input.matrix?.lines ?? []) {
    if (line.strength !== "direct-work" || line.experienceIndex === null) continue;
    if (line.evidenceId === `profile:experience:${line.experienceIndex}`) continue;
    const list = linesByRole.get(line.experienceIndex) ?? [];
    if (list.length >= MAX_LINES_PER_ROLE) continue;
    const provesTop = line.requirements.some((term) => topDirect.has(term.toLowerCase()));
    list.push({
      evidenceId: line.evidenceId,
      kind: "experience",
      classification: "professional-experience",
      priority: 0,
      reason: `Proves ${line.requirements.slice(0, 4).join(", ")} (posting rank ${line.bestRank})`,
      use: provesTop ? "summary proof and experience bullet" : "experience bullet and skills evidence",
    });
    linesByRole.set(line.experienceIndex, list);
  }
  for (const item of rankedExperience.slice(0, 4)) {
    const lines = linesByRole.get(item.index) ?? [];
    const proven = (input.matrix?.rows ?? [])
      .filter((row) => row.status === "proven" && row.evidence.some((entry) => entry.strength === "direct-work" && entry.experienceIndex === item.index))
      .map((row) => row.requirement);
    const matched = proven.length ? proven : item.matchedSkills;
    priorities.push({
      evidenceId: `profile:experience:${item.index}`,
      kind: "experience",
      classification: "professional-experience",
      priority: priority++,
      reason: matched.length ? `Matches ${matched.slice(0, 4).join(", ")}` : "Provides professional delivery context",
      use: "role context for the lines below; cite those lines, not the header, in bullets",
    });
    for (const line of lines) priorities.push({ ...line, priority: priority++ });
  }

  for (const match of projectSelection.selected) {
    const evidenceId = `profile:project:${match.project.slug}`;
    const proves = input.matrix?.lines.find((line) => line.evidenceId === evidenceId.replace(/[^a-z0-9:_-]/g, "-"))?.requirements ?? [];
    priorities.push({
      evidenceId,
      kind: "project",
      classification: projectClassification(match.project),
      priority: priority++,
      reason: proves.length ? `${match.reason}; proves ${proves.slice(0, 4).join(", ")}` : match.reason,
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

  // Lead with the top requirements that direct work proves (AUDIT.md §4.1):
  // a skill label alone is weaker proof than a responsibility line.
  const direct = new Set((input.matrix ? directWorkRequirements(input.matrix) : []).map((term) => term.toLowerCase()));
  const thesisTerms = mustProve.filter((term) => direct.has(term.toLowerCase())).slice(0, 3);
  const leadTerms = thesisTerms.length ? thesisTerms : mustProve.slice(0, 1);
  const lead = leadTerms.length
    ? `Lead with verified evidence that proves ${joinTerms(leadTerms)} for this ${input.role}; keep supporting evidence below it.`
    : `No top requirement of this ${input.role} is supported by the evidence; lead with the most relevant verified experience${domains[0] ? ` in ${domains[0]}` : ""} and do not imply the missing skills.`;
  const roleThesis = openGaps.length
    ? `${lead} Treat ${openGaps.slice(0, 3).join(", ")} as honest gaps or transferable experience, never as demonstrated skill.`
    : lead;
  const sectionOrder: ApplicationPlan["sectionOrder"] = input.educationFirst
    ? ["summary", "education", "experience", "projects", "certifications"]
    : (input.profile.projects?.length && projectSelection.selected.length ? ["summary", "experience", "projects", "education", "certifications"] : ["summary", "experience", "education", "certifications"]);

  return {
    roleThesis,
    mustProve,
    openGaps,
    gapDetails,
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
