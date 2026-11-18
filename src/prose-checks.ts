/**
 * Deterministic prose checks for the self-critique loop (AUDIT.md §4.2, §4.6).
 *
 * - Raw paraphrase: a bullet that copies its source line (a profile
 *   responsibility) or the job posting near-verbatim restates a duty instead
 *   of proving work (F7). Measured as word-trigram overlap: the share of the
 *   bullet's trigrams that also occur in the source.
 * - Adjective stack: three or more adjectives before a noun ("scalable,
 *   secure and robust cloud platform") reads as filler (§4.2 patterns).
 *
 * Linear in the text: no pattern repeats over unbounded input, and the
 * posting's trigrams are built once per review.
 */

/** Share of a bullet's word trigrams found in the source at or above which it is a raw paraphrase (§4.2: "> 0.7"). */
export const RAW_PARAPHRASE_THRESHOLD = 0.7;
/** Shorter bullets have too few trigrams to judge. */
export const RAW_PARAPHRASE_MIN_WORDS = 6;

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function wordsOf(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []);
}

export function trigrams(text: string): Set<string> {
  const words = wordsOf(text);
  const grams = new Set<string>();
  for (let index = 0; index + 2 < words.length; index += 1) grams.add(`${words[index]} ${words[index + 1]} ${words[index + 2]}`);
  return grams;
}

/** Share of `text`'s trigrams present in `source` (0 when `text` is too short to judge). */
export function trigramOverlap(text: string, source: ReadonlySet<string>): number {
  if (wordsOf(text).length < RAW_PARAPHRASE_MIN_WORDS) return 0;
  const grams = trigrams(text);
  if (grams.size === 0) return 0;
  let shared = 0;
  for (const gram of grams) if (source.has(gram)) shared += 1;
  return shared / grams.size;
}

/**
 * Adjectives common in CV filler. Suffix rules catch most others; this list
 * covers the short ones the suffixes miss.
 */
const ADJECTIVES = new Set([
  "agile", "bold", "brilliant", "clean", "complex", "critical", "dedicated", "deep", "diverse", "dynamic", "efficient",
  "elegant", "excellent", "expert", "fast", "flexible", "global", "high-quality", "holistic", "innovative", "intelligent",
  "key", "large", "lean", "major", "modern", "multiple", "new", "novel", "proactive", "proven", "rapid", "reliable",
  "resilient", "robust", "safe", "scalable", "secure", "seamless", "senior", "sharp", "smart", "solid", "strategic",
  "strong", "successful", "transparent", "unique", "various", "versatile", "world-class", "consistent", "competent",
  "independent", "relevant", "significant", "compliant", "redundant", "agentic", "advanced", "sophisticated",
  "motivated", "experienced", "talented", "skilled", "seasoned", "accomplished", "detail-oriented", "results-driven",
]);
/** Words that end like adjectives but are usually nouns or verbs in a CV. */
const NOT_ADJECTIVES = new Set([
  "approval", "removal", "proposal", "portal", "terminal", "manual", "journal", "signal", "interval", "rental", "capital",
  "arrival", "renewal", "referral", "tutorial", "material", "potential", "credential", "credentials", "principal", "total",
  "initiative", "archive", "drive", "directive", "executive", "objective", "alternative", "representative", "incentive",
  "table", "cable", "variable", "deliverable", "ansible", "timetable", "logic", "traffic", "topic", "metric", "music",
  "clinic", "epic", "rubric", "mechanic", "graphic", "public", "handful", "analytic", "analytics", "electric", "serverless",
  "wireless", "individual", "professional", "hospital", "animal", "festival", "survival", "trial", "denial", "dial",
  "the", "and", "or", "a", "an", "of",
]);
const ADJECTIVE_SUFFIX = /^(?:[a-z]{2,}(?:ive|able|ible|ful|ous|ical|ic|ial|less|ant|ent)|[a-z]+-(?:oriented|driven|focused|minded|native|ready|grade|performing|scale|level|facing|first|based|aware|centric|friendly))$/;

function isAdjective(word: string): boolean {
  if (NOT_ADJECTIVES.has(word)) return false;
  return ADJECTIVES.has(word) || ADJECTIVE_SUFFIX.test(word);
}

export interface AdjectiveStack {
  match: string;
  adjectives: string[];
}

/**
 * Runs of three or more adjectives followed by a word that is not one ("fast,
 * secure and scalable platform"). Lowercase words only, so product names
 * ("Microsoft Sentinel") never count; the first word of a sentence is read
 * lowercased.
 */
export function findAdjectiveStacks(text: string): AdjectiveStack[] {
  const tokens = [...text.matchAll(/[A-Za-z]+(?:-[A-Za-z]+)*/g)].map((match) => ({ word: match[0], start: match.index!, end: match.index! + match[0].length }));
  const hits: AdjectiveStack[] = [];
  let run: typeof tokens = [];
  let lastEnd = 0;
  let afterConjunction = false;
  for (const [index, token] of tokens.entries()) {
    const lowered = token.word.toLowerCase();
    const gap = text.slice(lastEnd, token.start);
    const atSentenceStart = index === 0 || /[.!?:;]\s*$/.test(text.slice(0, token.start));
    const lowercaseWord = token.word === lowered || (atSentenceStart && token.word.slice(1) === lowered.slice(1));
    const adjective = lowercaseWord && isAdjective(lowered);
    const joined = /^\s*,?\s+$|^\s*,\s*$/.test(gap);
    if (run.length > 0 && !afterConjunction && /^(?:and|&)$/.test(lowered) && joined) {
      afterConjunction = true;
      lastEnd = token.end;
      continue;
    }
    if (adjective && (run.length === 0 || joined)) {
      run.push(token);
    } else {
      if (run.length >= 3 && !afterConjunction && /^\s+$/.test(gap)) {
        hits.push({ match: text.slice(run[0]!.start, token.end), adjectives: run.map((item) => item.word.toLowerCase()) });
      }
      run = adjective ? [token] : [];
    }
    afterConjunction = false;
    lastEnd = token.end;
  }
  return hits;
}
