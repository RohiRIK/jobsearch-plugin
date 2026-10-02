/**
 * Market profiles — what a CV is expected to look like, per country.
 *
 * Why this is data and not a skill per country: the market axis is consumed by
 * BOTH halves of this repo. `scripts/match/template-engine.ts` scores templates
 * on it, and `src/application-draft.ts` injects it into the prompt bundle the
 * drafting LLM receives. A skill file only reaches the second, so encoding
 * conventions there would leave the template engine scoring Berlin as generic
 * "eu" while the prose told the model something else — two sources of truth
 * that drift apart.
 *
 * Conventions differ sharply and are frequently counter-intuitive: Switzerland
 * and Ireland are neighbours in the same market bloc where one expects a photo,
 * a work-permit line and an Arbeitszeugnis, and the other treats a photo as
 * grounds for rejection under employment-equality rules.
 *
 * These are conventions, not laws, and they move. Every profile carries its
 * sources so a claim can be re-checked rather than trusted indefinitely. When a
 * posting contradicts a profile, the posting wins.
 */

/** How strongly a photo is expected on the CV. */
export type PhotoNorm = "expected" | "common" | "optional" | "avoid";

/** How much personal data (age, marital status, nationality) is customary. */
export type PersonalDetailsNorm = "expected" | "some" | "minimal" | "avoid";

export interface MarketProfile {
  /** ISO-3166-1 alpha-2, lowercased. */
  code: string;
  name: string;
  /**
   * Coarse bucket used by template meta.json `markets`. Keeps existing
   * templates that declare "eu" matching every European market, so adding a
   * country never silently drops it to a 0.25 score.
   */
  region: "eu" | "il" | "us" | "remote";
  /** Detection patterns: cities, country names, endonyms. */
  patterns: RegExp[];
  /** Document language, most-preferred first. */
  languages: string[];
  photo: PhotoNorm;
  personalDetails: PersonalDetailsNorm;
  /** [min, max] pages for the CV. */
  pages: [number, number];
  /** Ordering convention within the CV. */
  ordering: "experience-first" | "education-first";
  /** Points the drafting model must honour. Kept short and imperative. */
  notes: string[];
  sources: string[];
}

const TILBURG =
  "Tilburg University Student Career Services, 'How do CVs differ from country to country?' (2022)";

export const MARKET_PROFILES: MarketProfile[] = [
  {
    code: "il",
    name: "Israel",
    region: "il",
    patterns: [/israel/i, /tel[- ]aviv/i, /herzliya/i, /haifa/i, /jerusalem/i, /ramat gan/i, /be'?er sheva/i, /[֐-׿]/],
    languages: ["English", "Hebrew"],
    photo: "avoid",
    personalDetails: "some",
    pages: [1, 2],
    ordering: "experience-first",
    notes: [
      "One page is the norm; two only for genuinely senior experience.",
      "Put a technical-skills block near the top — hi-tech recruiters and ATS scan for it first.",
      "Skip the photo for tech, business and public-sector roles unless the posting asks.",
      "Date of birth is commonly included locally but is optional; omit for multinationals.",
      "Hi-tech and multinationals usually expect English; match the posting's language.",
    ],
    sources: [
      "https://www.metaintro.com/blog/israeli-resume-format-guide",
      "https://anglo-list.com/your-israel-resume/",
    ],
  },
  {
    code: "dk",
    name: "Denmark",
    region: "eu",
    patterns: [/denmark/i, /copenhagen/i, /k[øo]benhavn/i, /aarhus/i, /odense/i, /aalborg/i, /dansk/i],
    languages: ["English", "Danish"],
    photo: "common",
    personalDetails: "some",
    pages: [1, 2],
    ordering: "experience-first",
    notes: [
      "A professional headshot is common in Denmark and not a liability.",
      "Workindenmark (official) invites a short personal section — age, family, interests — because employers weigh whether you will settle and stay. Sources conflict on how much to include; keep it brief and optional, and never add a CPR number.",
      "Lead with a personal profile statement; Danish employers read it first.",
      "Danish sign-off for a cover letter: 'Med venlig hilsen'.",
      "English is widely accepted; match the posting.",
    ],
    sources: [
      "https://www.workindenmark.dk/job-search-in-denmark/your-cv/personal-details-in-your-cv",
      "https://www.workindenmark.dk/job-search-in-denmark/your-cv/a-good-personal-profile-counts",
      TILBURG,
    ],
  },
  {
    code: "se",
    name: "Sweden",
    region: "eu",
    patterns: [/sweden/i, /stockholm/i, /gothenburg/i, /g[öo]teborg/i, /malm[öo]/i, /uppsala/i, /svensk/i],
    languages: ["English", "Swedish"],
    photo: "optional",
    personalDetails: "minimal",
    pages: [1, 2],
    ordering: "experience-first",
    notes: [
      "Photos are declining — anonymous recruitment has real traction in Sweden.",
      "Omit date of birth and marital status; never include a personnummer.",
      "State accomplishments matter-of-factly; the culture reads boastfulness poorly.",
    ],
    sources: [
      "https://www.bliply.eu/blog/cv-conventions-across-europe",
      TILBURG,
    ],
  },
  {
    code: "no",
    name: "Norway",
    region: "eu",
    patterns: [/norway/i, /oslo/i, /bergen/i, /trondheim/i, /stavanger/i, /norsk/i],
    languages: ["English", "Norwegian"],
    photo: "optional",
    personalDetails: "some",
    pages: [1, 2],
    ordering: "experience-first",
    notes: [
      "Reverse-chronological, recent experience first, education last.",
      "Personal details such as date of birth are often included but never required.",
      "Keep it short and plain; understatement is the norm.",
    ],
    sources: [
      "https://www.tech-careers-no.com/norwegian-resume-format/",
      TILBURG,
    ],
  },
  {
    code: "de",
    name: "Germany",
    region: "eu",
    patterns: [/germany/i, /deutschland/i, /berlin/i, /munich/i, /m[üu]nchen/i, /hamburg/i, /frankfurt/i, /cologne/i, /k[öo]ln/i, /stuttgart/i, /d[üu]sseldorf/i, /leipzig/i],
    languages: ["German", "English"],
    photo: "common",
    personalDetails: "some",
    pages: [2, 2],
    ordering: "education-first",
    notes: [
      "Two pages is the expected length for a Lebenslauf.",
      "Photo, date of birth and a signature are customary but legally optional under the AGG (2006) — none of it can be demanded. Berlin tech skews modern; traditional employers still expect them.",
      "State month AND year for every role, and account for gaps — unexplained gaps get asked about.",
      "Education is detailed and placed before work experience.",
      "Employers expect attachments: diploma copies and Arbeitszeugnisse (employer reference certificates).",
      "Working language is often English in Berlin tech; match the posting rather than assuming German.",
    ],
    sources: [
      "https://www.resumemate.io/blog/germany-cv-lebenslauf-rules-photo-certificates/",
      "https://www.topcv.io/blog/cv-for-germany-complete-guide-2026",
      TILBURG,
    ],
  },
  {
    code: "at",
    name: "Austria",
    region: "eu",
    patterns: [/austria/i, /[öo]sterreich/i, /vienna/i, /wien/i, /graz/i, /linz/i, /salzburg/i],
    languages: ["German", "English"],
    photo: "common",
    personalDetails: "some",
    pages: [1, 2],
    ordering: "education-first",
    notes: [
      "Follows German-speaking convention: photo and personal details customary, not required.",
      "Expect to supply Arbeitszeugnisse and diploma copies as attachments.",
    ],
    sources: [TILBURG],
  },
  {
    code: "ch",
    name: "Switzerland",
    region: "eu",
    patterns: [/switzerland/i, /schweiz/i, /suisse/i, /zurich/i, /z[üu]rich/i, /geneva/i, /gen[èe]ve/i, /basel/i, /bern/i, /lausanne/i, /lugano/i],
    languages: ["English", "German", "French"],
    photo: "expected",
    personalDetails: "expected",
    pages: [2, 3],
    ordering: "experience-first",
    notes: [
      "A photo is near-universal — roughly 85% of Swiss CVs carry one; omitting it stands out except at international corporates.",
      "State nationality and, if not a Swiss citizen, your work-permit status. This is expected, not intrusive.",
      "The Arbeitszeugnis matters more here than anywhere: applications without work certificates from previous employers are often treated as incomplete.",
      "Two pages standard, three acceptable for senior roles.",
      "Language follows the canton and the posting — German, French or English.",
    ],
    sources: [
      "https://cvboost.ch/en/cv-photo-switzerland",
      "https://www.visualcv.com/international/switzerland-cv/",
    ],
  },
  {
    code: "nl",
    name: "Netherlands",
    region: "eu",
    patterns: [/netherlands/i, /holland/i, /amsterdam/i, /rotterdam/i, /utrecht/i, /eindhoven/i, /the hague/i, /den haag/i, /nederland/i],
    languages: ["English", "Dutch"],
    photo: "common",
    personalDetails: "some",
    pages: [1, 2],
    ordering: "education-first",
    notes: [
      "A professional photo at the top is conventional and welcome.",
      "Education first while early-career; once experience accumulates, put experience above education.",
      "Tone is personal but formal, and direct — Dutch bluntness is a feature, not rudeness.",
      "English is widely accepted in tech.",
    ],
    sources: [TILBURG, "https://careerbldr.com/blog/cv-guide-netherlands/"],
  },
  {
    code: "be",
    name: "Belgium",
    region: "eu",
    patterns: [/belgium/i, /brussels/i, /bruxelles/i, /antwerp/i, /antwerpen/i, /ghent/i, /leuven/i],
    languages: ["English", "Dutch", "French"],
    photo: "common",
    personalDetails: "some",
    pages: [1, 2],
    ordering: "education-first",
    notes: [
      "Shares Dutch convention: photo at the top, reverse-chronological.",
      "Language depends on region (Flanders/Wallonia) and the posting — check before defaulting.",
    ],
    sources: [TILBURG],
  },
  {
    code: "uk",
    name: "United Kingdom",
    region: "eu",
    patterns: [/united kingdom/i, /\buk\b/i, /london/i, /manchester/i, /birmingham/i, /edinburgh/i, /glasgow/i, /bristol/i, /leeds/i, /cambridge/i, /\bengland\b/i, /scotland/i, /wales/i],
    languages: ["English"],
    photo: "avoid",
    personalDetails: "avoid",
    pages: [1, 2],
    ordering: "experience-first",
    notes: [
      "No photo and no personal details beyond contact information — UK firms actively discourage both.",
      "Plain, formal style; reverse-chronological with recent experience first.",
      "Two pages is the ceiling.",
      "Use British spelling.",
    ],
    sources: [TILBURG],
  },
  {
    code: "ie",
    name: "Ireland",
    region: "eu",
    patterns: [/ireland/i, /dublin/i, /cork/i, /galway/i, /limerick/i, /\beire\b/i],
    languages: ["English"],
    photo: "avoid",
    personalDetails: "avoid",
    pages: [2, 2],
    ordering: "experience-first",
    notes: [
      "No photo, no date of birth, no PPS number, no marital status, nationality or religion — these can get a CV rejected under employment-equality standards.",
      "Two A4 pages is standard; the US one-page constraint does not apply.",
      "Send a tailored cover letter unless the posting says otherwise.",
    ],
    sources: [
      "https://altercv.com/cv-format/ireland/",
      "https://www.visualcv.com/international/ireland/",
    ],
  },
  {
    code: "fr",
    name: "France",
    region: "eu",
    patterns: [/france/i, /paris/i, /lyon/i, /marseille/i, /toulouse/i, /bordeaux/i, /lille/i, /nantes/i],
    languages: ["French", "English"],
    photo: "common",
    personalDetails: "expected",
    pages: [1, 2],
    ordering: "experience-first",
    notes: [
      "Apply in French unless the posting is in English — expected even at international employers.",
      "Give the CV a title at the top that names the target role; it must stand out immediately.",
      "Include name, address, telephone, place of birth and email. State your age rather than date of birth.",
      "A 'Projet Professionnel' — the career you want and why — is often expected.",
      "Style is short and direct; lead with competences backed by examples.",
    ],
    sources: [TILBURG],
  },
  {
    code: "es",
    name: "Spain",
    region: "eu",
    patterns: [/spain/i, /espa[ñn]a/i, /madrid/i, /barcelona/i, /valencia/i, /seville/i, /sevilla/i, /bilbao/i, /m[áa]laga/i],
    languages: ["Spanish", "English"],
    photo: "expected",
    personalDetails: "expected",
    pages: [1, 2],
    ordering: "experience-first",
    notes: [
      "A professional photo at the top is conventional across Iberia.",
      "Personal details are customary.",
      "Write in Spanish unless the posting is in English.",
    ],
    sources: [TILBURG],
  },
  {
    code: "it",
    name: "Italy",
    region: "eu",
    patterns: [/italy/i, /italia/i, /milan/i, /milano/i, /rome/i, /roma/i, /turin/i, /torino/i, /bologna/i, /florence/i, /firenze/i],
    languages: ["Italian", "English"],
    photo: "common",
    personalDetails: "expected",
    pages: [1, 2],
    ordering: "experience-first",
    notes: [
      "Recruiters expect date of birth.",
      "Use your name as the title header.",
      "State your grade for each degree — omitting it is read as a low grade.",
      "Leave out hobbies and interests; focus on talents, goals and willingness to relocate.",
      "If you speak Italian, write in Italian and state your level, using the formal 'lei'.",
      "Two pages maximum.",
    ],
    sources: [TILBURG],
  },
  {
    code: "us",
    name: "United States",
    region: "us",
    patterns: [/united states/i, /\busa\b/i, /\bu\.s\.\b/i, /new york/i, /\bnyc\b/i, /san francisco/i, /austin/i, /seattle/i, /boston/i, /chicago/i, /denver/i, /atlanta/i],
    languages: ["English"],
    photo: "avoid",
    personalDetails: "avoid",
    pages: [1, 1],
    ordering: "experience-first",
    notes: [
      "One page. Concise and results-oriented.",
      "No photo, no date of birth, no marital status — these invite discrimination claims.",
      "Education is degrees only, placed after work experience.",
      "Quantify achievements; avoid the word 'I'.",
      "Use US spelling.",
    ],
    sources: [TILBURG],
  },
];

/** Fallback when no market can be identified from the posting. */
export const UNKNOWN_MARKET: MarketProfile = {
  code: "unknown",
  name: "Unspecified market",
  region: "remote",
  patterns: [],
  languages: ["English"],
  photo: "avoid",
  personalDetails: "avoid",
  pages: [1, 2],
  ordering: "experience-first",
  notes: [
    "No market detected, so the conservative international default applies: no photo, no personal details beyond contact information, two pages maximum.",
    "If you know the country, pass it explicitly rather than relying on detection.",
  ],
  sources: [],
};

export function getMarketProfile(code: string): MarketProfile | undefined {
  return MARKET_PROFILES.find((m) => m.code === code.toLowerCase());
}

/**
 * Identify the market a posting targets.
 *
 * Scores every profile by how many of its patterns hit, so a posting naming
 * both a country and its city ("Berlin, Germany") beats one that merely
 * mentions another country in passing ("our London office also hiring").
 * Ties break toward the earlier profile, which puts the home market first.
 */
export function detectMarket(posting: string): MarketProfile {
  let best: { profile: MarketProfile; hits: number } | null = null;
  for (const profile of MARKET_PROFILES) {
    const hits = profile.patterns.filter((p) => p.test(posting)).length;
    if (hits > 0 && (best === null || hits > best.hits)) best = { profile, hits };
  }
  return best?.profile ?? UNKNOWN_MARKET;
}

/**
 * Does a template declaring `markets` suit this market?
 *
 * Accepts the exact code or the market's coarse region, so a template that
 * predates per-country profiles and lists "eu" still matches Germany.
 */
export function templateSupportsMarket(templateMarkets: string[], profile: MarketProfile): boolean {
  return templateMarkets.includes(profile.code) || templateMarkets.includes(profile.region);
}

/** Render a profile as instructions for the drafting model. */
export function conventionsBlock(profile: MarketProfile): string {
  const photo: Record<PhotoNorm, string> = {
    expected: "Include a professional photo — it is expected here.",
    common: "A professional photo is common here and safe to include.",
    optional: "A photo is optional and increasingly uncommon; omit unless asked.",
    avoid: "Do NOT include a photo.",
  };
  const details: Record<PersonalDetailsNorm, string> = {
    expected: "Personal details (age, nationality) are customary here.",
    some: "A small amount of personal detail is acceptable but never required.",
    minimal: "Keep personal details to contact information only.",
    avoid: "Contact details only — no age, marital status or nationality.",
  };
  const [minPages, maxPages] = profile.pages;
  const length = minPages === maxPages ? `exactly ${minPages} page(s)` : `${minPages}-${maxPages} pages`;

  return [
    `Market: ${profile.name} (${profile.code}).`,
    `Preferred document language: ${profile.languages.join(" or ")} — but always match the posting's language.`,
    `CV length: ${length}. Ordering: ${profile.ordering.replace("-", " ")}.`,
    photo[profile.photo],
    details[profile.personalDetails],
    ...profile.notes.map((n) => `- ${n}`),
    "If the posting contradicts any of the above, the posting wins.",
  ].join("\n");
}

/**
 * Pick the document language for a posting.
 *
 * The market default is only a prior. Berlin tech, Amsterdam scale-ups and
 * Zurich corporates routinely run in English while sitting in a market whose
 * default language is not English, and a posting that states its working
 * language is stating a fact about the employer that beats any national
 * convention. An explicit statement therefore wins; otherwise the market
 * default applies.
 */
/**
 * The language a posting is written in, by its commonest function words; null
 * when the text is too short or no language clearly leads. Hebrew is detected
 * by script. Deliberately small: it only has to tell a Danish posting from an
 * English one, not translate anything.
 */
export function detectTextLanguage(text: string): string | null {
  if ((text.match(/[\u0590-\u05FF]/g) ?? []).length > 40) return "Hebrew";
  const words = text.toLowerCase().match(/[a-zæøåäöüßéèàç]+/g) ?? [];
  if (words.length < 30) return null;
  // Each list holds words that mark one language against its neighbours; a word
  // two close languages share (Danish/Norwegian/Swedish "det", "med") decides nothing.
  const STOP: Record<string, string[]> = {
    English: ["the", "and", "of", "to", "with", "you", "for", "our", "are", "will", "is", "in"],
    // Danish and Norwegian share most function words; only words that differ count.
    Danish: ["af", "vores", "efter", "meget", "dig", "mig", "hvad", "arbejde", "udvikling", "tilbyder", "ansøgning", "spændende", "virksomhed"],
    German: ["und", "der", "die", "das", "mit", "für", "wir", "sie", "ist", "ein", "zu", "von"],
    Dutch: ["het", "van", "een", "wij", "voor", "zijn", "niet", "ook", "bij", "naar", "werken", "ontwikkeling"],
    Swedish: ["och", "att", "är", "för", "inte", "oss", "vår", "våra", "arbeta", "utveckling", "erbjuder", "ansökan"],
    Norwegian: ["av", "våre", "etter", "mye", "deg", "meg", "hva", "arbeide", "utvikling", "tilbyr", "søknad", "spennende", "virksomhet"],
    French: ["et", "le", "les", "des", "pour", "vous", "nous", "avec", "est", "une", "dans", "du"],
    Spanish: ["y", "el", "los", "las", "para", "con", "que", "una", "es", "por", "del", "nuestro"],
  };
  const counts = Object.entries(STOP).map(([language, stop]) => {
    const set = new Set(stop);
    return { language, hits: words.filter((word) => set.has(word)).length };
  }).sort((a, b) => b.hits - a.hits);
  const [best, next] = counts;
  return best.hits >= 5 && best.hits >= next.hits * 1.3 ? best.language : null;
}

/**
 * The language an application to this posting is expected in: an explicit
 * statement wins, then the language the posting is written in, then the
 * market default.
 */
export function postingLanguage(profile: MarketProfile, posting: string): string {
  return statedLanguage(posting) ?? detectTextLanguage(posting) ?? profile.languages[0] ?? "English";
}

export function preferredLanguage(profile: MarketProfile, posting: string): string {
  return statedLanguage(posting) ?? profile.languages[0] ?? "English";
}

function statedLanguage(posting: string): string | null {
  const KNOWN = [
    "English", "German", "Danish", "Dutch", "French", "Spanish", "Italian",
    "Swedish", "Norwegian", "Hebrew", "Portuguese", "Polish",
  ];
  const statements = [
    /(?:our|the)?\s*(?:working|business|company|office|corporate)\s+language\s+(?:is|will be)\s+([A-Za-z]+)/i,
    /(?:working|business|company)\s+language:\s*([A-Za-z]+)/i,
    /we\s+(?:work|operate|communicate)\s+(?:only\s+)?in\s+([A-Za-z]+)/i,
    /([A-Za-z]+)\s+is\s+(?:our|the)\s+(?:working|business|company)\s+language/i,
    /fluent\s+([A-Za-z]+)\s+is\s+required/i,
    /(?:applications?|apply)\s+(?:must\s+be\s+)?in\s+([A-Za-z]+)/i,
    /(?:this\s+role|the\s+team)\s+operates\s+in\s+([A-Za-z]+)/i,
  ];

  for (const re of statements) {
    const m = posting.match(re);
    const claimed = m?.[1];
    if (!claimed) continue;
    const match = KNOWN.find((l) => l.toLowerCase() === claimed.toLowerCase());
    if (match) return match;
  }
  return null;
}
