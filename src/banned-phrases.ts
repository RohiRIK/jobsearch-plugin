/**
 * Banned phrases for generated application documents (AUDIT.md F11, §4.2).
 *
 * Every entry is a cliché or a filler phrase. It reads as generic résumé copy
 * whatever the evidence says, so `reviewApplicationDraft` reports a hit as an
 * ERROR (`BANNED_PHRASE`) and the draft fails review. Before this list it was a
 * 10-entry warning that never blocked anything.
 *
 * Matching is case-insensitive and whole-word, and it accepts a hyphen or a
 * space between words ("results driven" / "results-driven"). Entries that are
 * also legitimate technical vocabulary are scoped so the technical use still
 * passes: "dynamic groups" (Entra ID), "leverage ratio", "end-to-end
 * encryption", and "security posture of the client tenants".
 */

export interface BannedPhrase {
  /** Canonical label shown in the finding message. */
  phrase: string;
  /** Case-insensitive pattern. Boundaries are added by `findBannedPhrases`. */
  pattern: string;
  /** What to do instead; shown to the writer. */
  hint: string;
}

const SEP = "[\\s-]+";
const words = (...parts: string[]) => parts.join(SEP);

const SHOW_EVIDENCE = "State the concrete work and its result or scope from the evidence instead.";
const NAME_THE_WORK = "Name the action and the object (what you built, ran, or changed).";
const CUT = "Cut it; it adds no information.";

export const BANNED_PHRASES: readonly BannedPhrase[] = [
  // Carried over from the original ROBOTIC_PHRASES list.
  { phrase: "i am writing to apply", pattern: words("i", "am", "writing", "to", "apply"), hint: "Open with the strongest concrete match instead of announcing the application." },
  { phrase: "i am writing to express my", pattern: words("i", "am", "writing", "to", "express", "my"), hint: "Open with the strongest concrete match instead of announcing the application." },
  { phrase: "i believe my experience aligns", pattern: words("i", "believe", "my", "experience", "aligns?"), hint: "Show the alignment with one specific piece of evidence." },
  { phrase: "intersection of what i do best", pattern: words("intersection", "of", "what", "i", "do", "best"), hint: CUT },
  { phrase: "proven track record", pattern: words("proven", "track", "record"), hint: SHOW_EVIDENCE },
  { phrase: "measurable outcomes", pattern: words("measurable", "outcomes?"), hint: "Name the outcome itself, or the scope when the evidence has no number." },
  { phrase: "multiple production environments", pattern: words("multiple", "production", "environments?"), hint: "Name the environments or their scope from the evidence." },
  { phrase: "ready to deliver immediate impact", pattern: words("ready", "to", "deliver", "immediate", "impact"), hint: CUT },
  { phrase: "your esteemed company", pattern: words("your", "esteemed", "company"), hint: "Use the company name." },
  // "cutting-edge environment" is subsumed by the broader "cutting-edge" below.

  // Self-descriptions that any candidate could write (AUDIT.md §4.2 banned list).
  { phrase: "results-driven", pattern: words("results?", "(?:driven|oriented)"), hint: SHOW_EVIDENCE },
  { phrase: "passionate", pattern: "passionate(?:ly)?", hint: "Show the interest through specific work, not an adjective." },
  { phrase: "dynamic", pattern: `dynamic(?!${SEP}(?:groups?|membership|rules?|dns|routing|analysis|application security|programming|languages?|typing|link(?:ing|s)?|librar(?:y|ies)|content|pages?|data|scaling|provisioning|access|policies|policy|secrets?|inventory|disks?|memory|ip))`, hint: "Cut the adjective; describe the work." },
  // Scoped: "the change was motivated by audit findings" passes.
  { phrase: "motivated", pattern: `(?:(?:highly|self|very)${SEP}motivated|motivated${SEP}(?:professional|individual|engineer|candidate|team${SEP}player|self${SEP}starter))`, hint: CUT },
  { phrase: "detail-oriented", pattern: words("detail", "oriented"), hint: "Show care with a concrete example instead." },
  { phrase: "team player", pattern: words("team", "player"), hint: "Name who you worked with and what came of it." },
  { phrase: "self-starter", pattern: words("self", "starter"), hint: CUT },
  { phrase: "go-getter", pattern: words("go", "getter"), hint: CUT },
  { phrase: "hard-working", pattern: `hard(?:${SEP})?working`, hint: CUT },
  { phrase: "strong background in", pattern: words("strong", "background", "in"), hint: SHOW_EVIDENCE },
  { phrase: "extensive experience", pattern: words("extensive", "experience"), hint: "State the scope or duration from the evidence." },
  { phrase: "wide range of", pattern: words("(?:a", ")?wide", "range", "of"), hint: "Name the items." },
  { phrase: "various", pattern: "various", hint: "Name the specific items." },
  { phrase: "cutting-edge", pattern: words("cutting", "edge"), hint: "Name the technology." },
  { phrase: "state-of-the-art", pattern: words("state", "of", "the", "art"), hint: "Name the technology." },
  { phrase: "innovative solutions", pattern: words("innovative", "solutions?"), hint: NAME_THE_WORK },
  { phrase: "robust", pattern: "robust(?:ly|ness)?", hint: "Say what makes it reliable (tests, failover, review)." },
  { phrase: "seamless", pattern: "seamless(?:ly)?", hint: "Describe what actually happened during the change." },
  { phrase: "world-class", pattern: words("world", "class"), hint: CUT },
  { phrase: "best-in-class", pattern: words("best", "in", "class"), hint: CUT },
  { phrase: "synergy", pattern: "synerg(?:y|ies|istic)", hint: CUT },
  // "leverage" as a verb only: "leverage ratio" is a noun and passes.
  { phrase: "leverage (verb)", pattern: "(?:leverag(?:ed|es|ing)|leverage(?!\\s+ratios?\\b))", hint: "Use 'used' or name what you did with it." },
  { phrase: "spearheaded", pattern: "spearhead(?:ed|ing|s)?", hint: "Use a plain verb: led, started, built." },
  { phrase: "utilized", pattern: "utili[sz](?:e|ed|es|ing|ation)", hint: "Use 'used'." },
  { phrase: "responsible for", pattern: words("(?:was", ")?responsible", "for"), hint: "Lead with the action you took." },
  { phrase: "helped", pattern: `help(?:ed|ing)(?:${SEP}to)?`, hint: "State your own part of the work." },
  { phrase: "worked on", pattern: words("work(?:ed|ing)", "on"), hint: NAME_THE_WORK },
  { phrase: "involved in", pattern: words("(?:was", ")?involved", "in"), hint: "State your own part of the work." },
  { phrase: "tasked with", pattern: words("tasked", "with"), hint: "Lead with the action you took." },
  { phrase: "drive results", pattern: words("driv(?:e|es|ing|en)", "results"), hint: SHOW_EVIDENCE },
  { phrase: "value-add", pattern: words("value", "add(?:ed)?"), hint: "Name the value." },
  { phrase: "think outside the box", pattern: words("think(?:ing)?", "outside", "the", "box"), hint: CUT },
  { phrase: "hit the ground running", pattern: words("hit", "the", "ground", "running"), hint: CUT },
  { phrase: "fast-paced environment", pattern: words("fast", "paced", "environments?"), hint: CUT },
  // Scoped: "end to end" alone is a scope statement the rubric asks for.
  { phrase: "end-to-end solutions", pattern: words("end", "to", "end", "solutions?"), hint: NAME_THE_WORK },
  // Scoped: "improved the security posture of the client tenants" names an object and passes.
  {
    phrase: "enhance security posture (no object)",
    pattern: `(?:enhanc|improv|strengthen|bolster|elevat)(?:e|es|ed|ing)?${SEP}(?:(?:the|our|their|overall|organi[sz]ational)${SEP})*security${SEP}posture(?!${SEP}(?:of|for|across|in|at|on)\\b)`,
    hint: "Name what was secured and how.",
  },
];

export interface BannedPhraseHit {
  phrase: string;
  match: string;
  hint: string;
}

const COMPILED = BANNED_PHRASES.map((entry) => ({
  entry,
  regex: new RegExp(`(?<![a-z0-9])(?:${entry.pattern})(?![a-z0-9])`, "i"),
}));

/** Every banned phrase in `text`, once per phrase, in list order. */
export function findBannedPhrases(text: string): BannedPhraseHit[] {
  const hits: BannedPhraseHit[] = [];
  for (const { entry, regex } of COMPILED) {
    const match = regex.exec(text);
    if (match) hits.push({ phrase: entry.phrase, match: match[0], hint: entry.hint });
  }
  return hits;
}

/** Short comma list for the writer prompt, so the model avoids what review will fail. */
export function bannedPhrasePromptList(): string {
  return BANNED_PHRASES.map((entry) => entry.phrase.replace(/\s*\(.*\)$/, "")).join(", ");
}
