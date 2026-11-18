/**
 * Per-section CV rubrics (AUDIT.md §4.2, F3-F7, F10).
 *
 * The writer prompt used to give lengths, not purposes ("Write a 40-65 word CV
 * summary"), and the only section guidance lived in a LaTeX-era guide that
 * asked for "Reduced processing time by X%". These rubrics say what each
 * section is for, what it must contain and what fails it. They are injected
 * into the writer prompt verbatim; `job-search/skills/cv/SectionRubrics.md` is
 * the human-readable copy and a test keeps the two in step.
 *
 * Deterministic review enforces the mechanical parts (evidence types, no
 * placeholder or unsupported numbers, banned phrases). The judgement parts
 * (value proposition, problem-action-result) are for the writer now and the
 * rubric critic in a later PR.
 */

export type RubricSection = "headline" | "summary" | "skills" | "experience" | "projects";

export interface SectionRubric {
  section: RubricSection;
  /** What the section is for, in one sentence. */
  purpose: string;
  length: string;
  mustContain: readonly string[];
  fails: readonly string[];
}

/** The hard rule every section shares (AUDIT.md §4, "Hard rule"). */
export const NO_INVENTED_METRICS =
  "Never invent a metric. A number may appear only when the cited evidence contains that same number. When the evidence has no number, state the scope (which tenants, platforms, users or systems the evidence names; \"every client tenant\"; \"end to end\") or the concrete result (\"replaced manual GPO review with a scripted mapping\"). Never write a placeholder such as X%, N users, [metric] or TBD.";

export const SECTION_RUBRICS: readonly SectionRubric[] = [
  {
    section: "headline",
    purpose: "Name the candidate's role identity for this posting.",
    length: "at most 10 words",
    mustContain: ["the target role noun", "one or two differentiating domains from direct-work matrix rows"],
    fails: ["a pipe- or comma-separated keyword list", "more than three tool names", "the profile headline copied verbatim"],
  },
  {
    section: "summary",
    purpose: "A tailored value proposition: who the candidate is for this role, the proof, and what the team gets.",
    length: "2-3 sentences, 40-65 words",
    mustContain: [
      "role identity plus years or scope taken from evidence",
      "one concrete proof tied to the top-ranked requirement, citing a responsibility, achievement or project line from the evidence matrix, not a skill label",
      "fit to the problem the posting states, or the candidate's differentiator",
    ],
    fails: [
      "a list of more than four tool names",
      "a sentence that would fit any job",
      "a gap or a label-only requirement stated as a capability",
      "citing only identity or skill-label evidence",
    ],
  },
  {
    section: "skills",
    purpose: "Show the reader, in the posting's own language, that the candidate covers its requirements.",
    length: "1-5 groups, at most 6 items each, at most 24 items",
    mustContain: [
      "groups named after the posting's capability areas, not the profile's categories",
      "items ordered by the requirement's posting rank",
      "every item cites at least one experience, achievement or project evidence ID that proves it",
    ],
    fails: [
      "an item whose only evidence is its own profile:skill label (self-citing)",
      "a gap or label-only requirement",
      "generic soft skills",
    ],
  },
  {
    section: "experience",
    purpose: "Prove the thesis with work the candidate actually did in that role.",
    length: "3-6 bullets per role, at most 30 words each",
    mustContain: [
      "problem or context, then the action (verb + object + method or stack), then the result or the scope",
      "the first bullet of the first role proves mustProve[0]",
      "one requirement per bullet, citing the responsibility, achievement or employer-linked project that proves it",
    ],
    fails: [
      "a paraphrased responsibility with no result or scope",
      "more than four tool names in one bullet",
      "a bullet citing only the role header or skill labels",
      "an invented or placeholder number",
    ],
  },
  {
    section: "projects",
    purpose: "Add proof that the work history cannot fully cover.",
    length: "0-2 projects",
    mustContain: ["problem, then what was built (approach), then the outcome or scope", "personal/work status comes from the project's kind, never from prose"],
    fails: ["disclosure notes in the copy (\"unrelated to ...\")", "a feature list with no problem", "a personal project placed under a role"],
  },
];

export function rubricFor(section: RubricSection): SectionRubric {
  const rubric = SECTION_RUBRICS.find((entry) => entry.section === section);
  if (!rubric) throw new Error(`No rubric for ${section}`);
  return rubric;
}

/** Plain-text rubric block for the writer prompt. */
export function rubricPromptBlock(): string {
  const sections = SECTION_RUBRICS.map((rubric) =>
    [
      `${rubric.section.toUpperCase()} (${rubric.length}): ${rubric.purpose}`,
      `  Must contain: ${rubric.mustContain.join("; ")}.`,
      `  Fails: ${rubric.fails.join("; ")}.`,
    ].join("\n"),
  );
  return [...sections, `ALL SECTIONS: ${NO_INVENTED_METRICS}`].join("\n");
}

/**
 * Metric placeholders: the template slots ("Reduced processing time by X%")
 * a model copies when the evidence has no number. Case-sensitive for the
 * single letters so ordinary words and product names ("X (Twitter)",
 * "Windows") are not flagged; a unit or a "by" is required after them.
 */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  // X%, XX%, X.X%, N%, X+ users, N tenants, $X, Xk, X hours
  /(?<![A-Za-z0-9])(?:X{1,3}|N{1,2})(?:[.,]X+)?\s?(?:%|\+|percent\b|[kKM]\b|million\b|hours?\b|days?\b|weeks?\b|months?\b|years?\b|users?\b|devices?\b|endpoints?\b|tenants?\b|clients?\b|customers?\b|servers?\b|people\b|engineers?\b|teams?\b|times?\b|x\b)/,
  /(?<![A-Za-z0-9])\$\s?(?:X{1,3}|N{1,2})(?![A-Za-z0-9])/,
  // "reduced by X" as a quantity slot. Not "to X": that is also the social network.
  /\bby\s(?:X{1,3}|N{1,2})\s*(?:$|[.,;])/,
  // Bracketed or braced slots: [metric], [X], [number], {percent}, <metric>
  /[[{<]\s*(?:x{1,3}|n|y|number|num|metric|metrics|percent(?:age)?|amount|value|figure|count|result|kpi|tbd|todo|insert[^\]}>]{0,40})\s*[\]}>]/i,
  // Lowercase slots only before a percent sign: "x%", "by x%", "xx percent".
  // "x86", "10x" and "x (Twitter)" carry no percent and stay clean.
  /(?<![A-Za-z0-9])x{1,3}(?:[.,]x+)?\s?(?:%|percent\b)/,
  // "X-fold", "x fold", "N-fold" growth.
  /(?<![A-Za-z0-9])(?:X{1,3}|x{1,3}|N{1,2})[-\s]?fold\b/,
  /\b(?:TBD|TBC|TODO|FIXME)\b/,
  /\?\?+%?/,
  // "#%", "##%", "__%": a symbol standing in for the number. "#1" is a rank.
  /(?<![A-Za-z0-9])[#_]+\s?%/,
];

export interface PlaceholderHit {
  match: string;
}

/** Every metric placeholder in `text`, once per pattern. */
export function findPlaceholderMetrics(text: string): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = pattern.exec(text);
    if (match) hits.push({ match: match[0] });
  }
  return hits;
}
