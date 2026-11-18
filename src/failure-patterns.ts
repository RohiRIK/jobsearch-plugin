/**
 * Failure-pattern library for the rubric critic (AUDIT.md §2b F1-F13, §4.6).
 *
 * Each pattern is a failure signature the audit traced to a root cause, with
 * one negative example. The examples are SYNTHETIC: written for the fixture
 * persona (a platform engineer at "Example Labs"), not taken from any real
 * CV. The audit asks for the anonymised passages from the owner's failing
 * resumes as examples; those attachments are still missing (AUDIT.md §0), so
 * they are not here. `job-search/skills/cv/FailurePatterns.md` is the
 * human-readable copy and a test keeps the two in step.
 */
import type { CritiqueSection } from "./critique-sections.js";

export interface FailurePattern {
  id: string;
  /** Where it shows up. "portfolio" patterns are for the portfolio critic (PR 5). */
  section: CritiqueSection | "portfolio";
  signature: string;
  /** Synthetic negative example: this must not appear in a passing draft. */
  example: string;
  /** What the rewrite does instead. */
  fix: string;
}

export const FAILURE_PATTERNS: readonly FailurePattern[] = [
  {
    id: "F1",
    section: "summary",
    signature: "The opening leads with a commodity skill (Python, cloud, security) instead of the posting's top requirement; it would fit any job.",
    example: "Python professional with cloud and security experience who enjoys solving problems.",
    fix: "Open with the role identity and the proof for the top-ranked requirement in the evidence matrix.",
  },
  {
    id: "F2",
    section: "summary",
    signature: "The draft hedges with or pads in skills the candidate lacks (gaps) instead of leaving them out or disclosing them plainly.",
    example: "Familiar with Kubernetes concepts and ready to apply them across the platform.",
    fix: "Leave gaps out of the CV; disclose one plainly in the cover letter only when it helps.",
  },
  {
    id: "F3",
    section: "summary",
    signature: "A technology list with no value proposition, scope or reason this team gets something from the hire.",
    example: "Engineer skilled in Python, Terraform, Docker, Linux, Git and CI/CD pipelines.",
    fix: "Say who the candidate is for this role, one concrete proof, and what the team gets.",
  },
  {
    id: "F4",
    section: "headline",
    signature: "The headline is a pipe- or comma-separated keyword string copied from the profile.",
    example: "Platform Engineer | Python | Terraform | Docker | Linux",
    fix: "Name the target role and one or two differentiating domains in at most 10 words.",
  },
  {
    id: "F5",
    section: "skills",
    signature: "A flat dump under the profile's own category names, not grouped or ordered by the posting.",
    example: "Tools: Python, Terraform, Docker, Bash, Git, Jira, Confluence, Linux, Excel",
    fix: "Group by the posting's capability areas, order by requirement rank, cut what the posting does not ask for.",
  },
  {
    id: "F6",
    section: "skills",
    signature: "A skill reads as an unsupported claim because its only evidence is its own saved skill label.",
    example: "Zero Trust architecture (cited only as profile:skill)",
    fix: "Cite the responsibility, achievement or project that proves it, or leave it out.",
  },
  {
    id: "F7",
    section: "experience",
    signature: "A bullet paraphrases a responsibility with no problem, result or scope, or lists many tools in one line.",
    example: "Responsible for maintaining deployment tooling with the security team using Python, Terraform, Docker, Git and Jenkins.",
    fix: "Action + object + method + result or scope from the evidence; one requirement per bullet.",
  },
  {
    id: "F8",
    section: "experience",
    signature: "The same work appears in the summary, skills and several bullets with the same wording.",
    example: "Automated cloud environment delivery (summary), Cloud environment delivery automation (skills), Automated cloud delivery (two bullets)",
    fix: "State each piece of work once where it proves the most; refer back with different wording.",
  },
  {
    id: "F9",
    section: "projects",
    signature: "Defensive disclosure notes in the copy (\"personal side project, unrelated to my employer\").",
    example: "Delivery Pipeline (personal side project, unrelated to Example Labs)",
    fix: "The project's kind carries personal or work status; the copy states the problem and what was built.",
  },
  {
    id: "F10",
    section: "projects",
    signature: "A project blurb is a feature list with no problem, approach or outcome.",
    example: "Delivery Pipeline: YAML config, plugin system, dashboards, notifications, CLI.",
    fix: "Problem, then what was built, then the outcome or scope the evidence states.",
  },
  {
    id: "F11",
    section: "document",
    signature: "Robotic phrases and clichés (results-driven, proven track record, passionate, leverage).",
    example: "Results-driven engineer with a proven track record of leveraging cutting-edge tools.",
    fix: "Cut the phrase; state the specific work and its scope.",
  },
  {
    id: "F12",
    section: "document",
    signature: "Keyword stuffing and synonym-chasing: filler sentences that exist to repeat posting terms.",
    example: "Delivers secure cloud solutions for secure cloud environments with cloud security best practices.",
    fix: "Use the posting's exact term once where the evidence supports it; leave real gaps visible.",
  },
  {
    id: "F13",
    section: "portfolio",
    signature: "The portfolio is a profile dump with no role targeting, narrative or project frame.",
    example: "Skills (all) followed by raw responsibilities and an unfiltered repository list.",
    fix: "Portfolio v2 (PR 5): featured case studies framed as problem, approach and outcome.",
  },
];

/** The patterns a CV critic checks (portfolio ones excluded). */
export function cvFailurePatterns(): FailurePattern[] {
  return FAILURE_PATTERNS.filter((pattern) => pattern.section !== "portfolio");
}
