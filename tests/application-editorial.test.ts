import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildApplicationBrief, reviewApplicationDraft } from "../src/application-draft.js";
import { renderCvTypst, selectedLinks } from "../src/application-renderers.js";
import { detectMarket, detectTextLanguage, getMarketProfile, resolvePostingLanguage } from "../src/market-profiles.js";
import { applicationPosting, applicationProfile, validApplicationDraft } from "./fixtures/application.js";

// Issue #8: editorial defects the gates did not catch.
const brief = buildApplicationBrief({ profile: applicationProfile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });

describe("salutation", () => {
  const codes = (recipient: string) => {
    const draft = validApplicationDraft();
    draft.coverLetter.recipient = recipient;
    return reviewApplicationDraft(draft, brief).findings.map((f) => f.code);
  };
  test("a recipient that is the company or role is rejected", () => {
    expect(codes("Acme — Platform Engineer")).toContain("UNNATURAL_SALUTATION");
    expect(codes("Acme")).toContain("UNNATURAL_SALUTATION");
  });
  test("a person or the hiring team passes", () => {
    expect(codes("Hiring Team")).not.toContain("UNNATURAL_SALUTATION");
    expect(codes("Ms Jensen")).not.toContain("UNNATURAL_SALUTATION");
  });
});

const DANISH = `Vi søger en erfaren sikkerhedsarkitekt til vores team i kommunen. Du får ansvar for arkitektur og drift af
sikkerhedsløsninger, og du vil arbejde tæt sammen med vores it-afdeling. Det er en fordel, hvis du har erfaring med
identitet og adgangsstyring. Vi tilbyder en spændende stilling med gode muligheder for udvikling, og vi ser frem til at
modtage din ansøgning. Stillingen er på fuld tid, og du refererer til it-chefen. Der er tale om en fast stilling.`;
const ENGLISH = `We are looking for an experienced security architect to join our team. You will own the architecture and
operation of security solutions and work closely with our IT department. Experience with identity and access management is
an advantage. We offer an exciting position with good opportunities for growth, and we look forward to your application.`;

describe("posting language", () => {
  test("detects the language a posting is written in", () => {
    expect(detectTextLanguage(DANISH)).toBe("Danish");
    expect(detectTextLanguage(ENGLISH)).toBe("English");
    expect(detectTextLanguage("Platform Engineer. Python.")).toBeNull();
  });
  test("an English posting in a Danish market briefs the writer in English", () => {
    const englishInDenmark = buildApplicationBrief({ profile: applicationProfile, posting: `${ENGLISH} Location: Copenhagen, Denmark.`, company: "Acme", role: "Security Architect", market: "dk" });
    expect(englishInDenmark.language).toBe("English");
    const danish = buildApplicationBrief({ profile: applicationProfile, posting: DANISH, company: "Kommune", role: "Sikkerhedsarkitekt", market: "dk" });
    expect(danish.language).toBe("Danish");
  });
});

// Issue #14: a Danish posting full of "du" and "et" (shared with French) came
// back null, and the Danish market default (English) was then taken as the
// posting's language, so no confirmation was asked for.
const DANISH_DU_ET = `Har du lyst til at sætte retningen for informationssikkerheden i en stor kommune? Vi søger en erfaren
sikkerhedsarkitekt, der kan omsætte krav fra lovgivning og standarder til konkrete løsninger. Du bliver en del af et
engageret team, som arbejder tæt sammen med it-drift og jura. Du udarbejder sikkerhedsarkitekturen for kommunens systemer,
og du deltager i risikovurderinger. Du har en relevant uddannelse og erfaring med identitets- og adgangsstyring, og du er
god til at formidle komplekse emner. Vi tilbyder et spændende job med gode muligheder for faglig udvikling.`;

describe("posting language resolution", () => {
  test("a Danish posting with du/et is Danish, not French and not unknown", () => {
    expect(detectTextLanguage(DANISH_DU_ET)).toBe("Danish");
    expect(resolvePostingLanguage(getMarketProfile("dk")!, DANISH_DU_ET)).toEqual({ language: "Danish", source: "detected" });
  });
  test("an explicit working-language statement still wins", () => {
    expect(resolvePostingLanguage(getMarketProfile("dk")!, `${DANISH_DU_ET} The working language is English.`)).toEqual({ language: "English", source: "stated" });
  });
  test("too little text is reported as a market default, not as a detected language", () => {
    expect(resolvePostingLanguage(getMarketProfile("dk")!, "Sikkerhedsarkitekt, Kubernetes, Entra ID.")).toEqual({ language: "English", source: "market-default" });
  });
});

describe("market detection", () => {
  test("place names match whole words only", () => {
    expect(detectMarket("Requirements: Python, Terraform, Kubernetes.").code).toBe("unknown");
    expect(detectMarket("Baseline hardening; coffee aroma.").code).toBe("unknown");
    expect(detectMarket("Office in Bern").code).toBe("ch");
    expect(detectMarket("Office in Malmö").code).toBe("se");
    expect(detectMarket("Dansktalende kollega i København").code).toBe("dk");
    expect(detectMarket("משרה בתל אביב").code).toBe("il");
  });
});

describe("profile links", () => {
  const profile = structuredClone(applicationProfile);
  profile.identity.github = "https://github.com/octocat";

  test("every profile link is on the CV by default, and the selection is reported", () => {
    expect(selectedLinks(profile)).toEqual({ included: ["linkedin", "github", "blog"], omitted: [] });
    const source = renderCvTypst({ profile, draft: validApplicationDraft(), outDir: "/tmp" });
    expect(source).toContain('link("https://github.com/octocat")[GitHub]');
  });

  test("a narrowed selection reports what it left out", () => {
    expect(selectedLinks(profile, ["linkedin"])).toEqual({ included: ["linkedin"], omitted: ["github", "blog"] });
    expect(renderCvTypst({ profile, draft: validApplicationDraft(), outDir: "/tmp", links: ["linkedin"] })).not.toContain("github.com");
  });
});

describe("render language decision", () => {
  const ROOT = resolve(import.meta.dir, "..");
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "render-language-"));
    mkdirSync(join(dir, "home", "data"), { recursive: true });
    writeFileSync(join(dir, "home", "data", "profile.json"), JSON.stringify(applicationProfile));
    writeFileSync(join(dir, "job.txt"), DANISH);
    const draft = validApplicationDraft();
    draft.role = "Sikkerhedsarkitekt";
    draft.company = "Kommune";
    // The fixture's portfolio project is not matched to this posting, so it cannot be cited.
    draft.strategy.evidencePriorities = draft.strategy.evidencePriorities.filter((p) => !p.evidenceId.startsWith("profile:project:"));
    writeFileSync(join(dir, "draft.json"), JSON.stringify(draft));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const render = (extra: string[]) =>
    Bun.spawnSync([process.execPath, join(ROOT, "scripts/generate/application.ts"), "render", "--draft", join(dir, "draft.json"), "--job", join(dir, "job.txt"), "--market", "dk", "--layout", "modern", "--force", ...extra], {
      env: { ...process.env, JOB_SEARCH_HOME: join(dir, "home") },
    });

  test("an English draft for a Danish posting needs an explicit --language", () => {
    const refused = render([]);
    expect(refused.exitCode).not.toBe(0);
    const err = JSON.parse(refused.stderr.toString());
    expect(err.code).toBe("LANGUAGE_CHOICE_REQUIRED");
    expect(err.details).toMatchObject({ draftLanguage: "English", postingLanguage: "Danish", candidateLanguages: ["English"] });
  });

  test("when the posting's language is unknown in a multi-language market, the choice is still required", () => {
    writeFileSync(join(dir, "short.txt"), "Sikkerhedsarkitekt. Kubernetes, Entra ID. København.");
    const proc = Bun.spawnSync([process.execPath, join(ROOT, "scripts/generate/application.ts"), "render", "--draft", join(dir, "draft.json"), "--job", join(dir, "short.txt"), "--layout", "modern", "--force"], {
      env: { ...process.env, JOB_SEARCH_HOME: join(dir, "home") },
    });
    const err = JSON.parse(proc.stderr.toString());
    expect(err.code).toBe("LANGUAGE_CHOICE_REQUIRED");
    expect(err.details).toMatchObject({ postingLanguage: null, postingLanguageSource: "market-default", marketLanguages: ["English", "Danish"] });
  });

  test("confirming the language renders and reports the decision", () => {
    const run = render(["--language", "English"]);
    const out = JSON.parse(run.stdout.toString());
    expect(out.written).toBe(true);
    expect(out.language).toEqual({ document: "English", posting: "Danish", postingSource: "detected", candidateLists: true });
    expect(out.links).toEqual({ included: ["linkedin", "blog"], omitted: [] });
    expect(readFileSync(join(dir, "home", out.files.cv), "utf-8")).toContain("[LinkedIn]");
  });
});
