import { describe, expect, test } from "bun:test";
import {
  MARKET_PROFILES,
  UNKNOWN_MARKET,
  conventionsBlock,
  detectMarket,
  getMarketProfile,
  preferredLanguage,
  templateSupportsMarket,
} from "../src/market-profiles.js";

describe("detectMarket", () => {
  const cases: Array<[string, string]> = [
    ["Cloud Security Engineer, Zalando SE, Berlin, Germany", "de"],
    ["Security Engineer at Maersk, Copenhagen, Denmark", "dk"],
    ["Platform Engineer, Stripe, Dublin, Ireland", "ie"],
    ["Security Analyst, UBS, Zurich, Switzerland", "ch"],
    ["Backend Engineer, Adyen, Amsterdam, Netherlands", "nl"],
    ["DevOps Engineer, Monzo, London, United Kingdom", "uk"],
    ["Ingénieur Cloud, Paris, France", "fr"],
    ["Cloud Engineer, Spotify, Stockholm, Sweden", "se"],
    ["Security Engineer, Oslo, Norway", "no"],
    ["Cloud Engineer, Wix, Tel Aviv, Israel", "il"],
    ["Staff Engineer, Datadog, New York, USA", "us"],
    ["Ingegnere Cloud, Milano, Italy", "it"],
    ["Ingeniero Cloud, Barcelona, Spain", "es"],
    ["Cloud Engineer, Vienna, Austria", "at"],
    ["Engineer, Brussels, Belgium", "be"],
  ];

  for (const [posting, expected] of cases) {
    test(`${expected}: ${posting.slice(0, 44)}`, () => {
      expect(detectMarket(posting).code).toBe(expected);
    });
  }

  test("Hebrew script alone identifies Israel", () => {
    expect(detectMarket("דרוש מהנדס ענן").code).toBe("il");
  });

  test("falls back to a conservative default when no market is named", () => {
    const m = detectMarket("Fully remote Cloud Security Engineer, async team");
    expect(m.code).toBe("unknown");
    expect(m.photo).toBe("avoid");
    expect(m.personalDetails).toBe("avoid");
  });

  // The old detector put Germany, the UK, the Netherlands and Ireland in one
  // "eu" bucket — the exact set whose conventions conflict most.
  test("Berlin and London no longer collapse into the same market", () => {
    const berlin = detectMarket("Cloud Security Engineer, Berlin, Germany");
    const london = detectMarket("Cloud Security Engineer, London, United Kingdom");
    expect(berlin.code).not.toBe(london.code);
    expect(berlin.photo).toBe("common");
    expect(london.photo).toBe("avoid");
  });

  test("a country named alongside its city outweighs a passing mention", () => {
    const posting = "Role based in Berlin, Germany. Our London office is also hiring.";
    expect(detectMarket(posting).code).toBe("de");
  });
});

describe("templateSupportsMarket", () => {
  test("a template declaring the exact country matches", () => {
    expect(templateSupportsMarket(["de", "us"], getMarketProfile("de")!)).toBe(true);
  });

  // Templates written before per-country profiles declare markets: ["eu"].
  // They must keep matching, or adding a country silently demotes every one.
  test("a template declaring only the region still matches a European country", () => {
    for (const code of ["de", "ie", "ch", "se", "fr"]) {
      expect(templateSupportsMarket(["dk", "us", "eu"], getMarketProfile(code)!)).toBe(true);
    }
  });

  test("an unrelated market does not match", () => {
    expect(templateSupportsMarket(["il", "us"], getMarketProfile("de")!)).toBe(false);
  });
});

describe("profile data integrity", () => {
  test("covers at least 10 markets", () => {
    expect(MARKET_PROFILES.length).toBeGreaterThanOrEqual(10);
  });

  test("codes are unique", () => {
    const codes = MARKET_PROFILES.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("every profile carries patterns, a language, and a sane page range", () => {
    for (const m of MARKET_PROFILES) {
      expect(m.patterns.length).toBeGreaterThan(0);
      expect(m.languages.length).toBeGreaterThan(0);
      expect(m.pages[0]).toBeGreaterThan(0);
      expect(m.pages[1]).toBeGreaterThanOrEqual(m.pages[0]);
      expect(m.notes.length).toBeGreaterThan(0);
    }
  });

  // These are conventions that shift, not laws. A claim nobody can re-check is
  // a claim that quietly goes stale.
  test("every profile cites at least one source", () => {
    for (const m of MARKET_PROFILES) {
      expect(m.sources.length).toBeGreaterThan(0);
    }
  });
});

describe("conventionsBlock", () => {
  test("states the photo rule explicitly for both extremes", () => {
    expect(conventionsBlock(getMarketProfile("ie")!)).toContain("Do NOT include a photo");
    expect(conventionsBlock(getMarketProfile("ch")!)).toContain("expected");
  });

  test("names the market, its language and the page budget", () => {
    const block = conventionsBlock(getMarketProfile("de")!);
    expect(block).toContain("Germany (de)");
    expect(block).toContain("German");
    expect(block).toContain("exactly 2 page(s)");
  });

  test("lets the posting override the convention", () => {
    expect(conventionsBlock(UNKNOWN_MARKET)).toContain("the posting wins");
  });
});

describe("preferredLanguage", () => {
  const de = getMarketProfile("de")!;

  // Berlin tech routinely runs in English while sitting in a market whose
  // default is German. A posting stating its working language is stating a
  // fact about the employer, which beats a national convention.
  test("an explicitly stated working language overrides the market default", () => {
    expect(preferredLanguage(de, "Working language is English; German is a plus.")).toBe("English");
    expect(preferredLanguage(de, "Our working language is English.")).toBe("English");
    expect(preferredLanguage(de, "We operate in English.")).toBe("English");
  });

  test("falls back to the market default when nothing is stated", () => {
    expect(preferredLanguage(de, "Wir suchen einen Cloud Engineer in Berlin.")).toBe("German");
  });

  test("an explicit local-language requirement is honoured too", () => {
    expect(preferredLanguage(de, "Applications must be in German.")).toBe("German");
    expect(preferredLanguage(getMarketProfile("ch")!, "The team operates in French.")).toBe("French");
  });

  test("ignores a language it does not recognise", () => {
    expect(preferredLanguage(de, "Our working language is Klingon.")).toBe("German");
  });
});
