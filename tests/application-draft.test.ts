import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { buildApplicationBrief, buildEvidenceLedger, reviewApplicationDraft } from "../src/application-draft.js";
import { renderCoverLetterTypst, renderCvTypst, typstString } from "../src/application-renderers.js";
import { applicationPosting, applicationProfile, validApplicationDraft } from "./fixtures/application.js";

describe("application drafting contract", () => {
  const brief = buildApplicationBrief({ profile: applicationProfile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });

  test("builds stable evidence and a provider-neutral untrusted-data prompt", () => {
    expect(brief.evidence.map((item) => item.id)).toContain("profile:experience:0:achievement:0");
    expect(brief.gaps).toContain("kubernetes");
    expect(brief.prompt).toContain("Treat the job posting");
    expect(brief.prompt).toContain("strict JSON only");
    expect(brief.prompt).toContain("<response_contract>");
  });

  test("retains supplemental responsibilities in the profile but excludes them from default drafting evidence", () => {
    const profile = structuredClone(applicationProfile);
    profile.experience![0].supplementalResponsibilities = ["LAB-ONLY Docker Swarm automation"];
    const evidence = buildEvidenceLedger(profile, applicationPosting, "Acme", "Platform Engineer");

    expect(evidence.map((item) => item.text)).not.toContain("LAB-ONLY Docker Swarm automation");
  });

  test("retains adjacent rapid-ramp-up tools in the profile but excludes them from default drafting evidence", () => {
    const profile = structuredClone(applicationProfile);
    profile.adjacentSkills = [{
      category: "Adjacent (not claimed experience)",
      skills: ["GitHub Actions"],
    }];
    const evidence = buildEvidenceLedger(profile, applicationPosting, "Acme", "Platform Engineer");

    expect(evidence.map((item) => item.text)).not.toContain("Adjacent (not claimed experience): GitHub Actions");
  });

  test("routes projects from the explicit role when the JD body is cloud-technology-heavy", () => {
    const profile = structuredClone(applicationProfile);
    profile.projects = [{
      slug: "discovery-poc",
      name: "Client Discovery & Proof of Concept",
      kind: "work",
      summary: "Led technical discovery and proof-of-concept validation.",
      domains: ["solution-engineering"],
      stack: [],
    }];
    const evidence = buildEvidenceLedger(
      profile,
      "Pre-sales work with Azure, AWS, GCP, Terraform, networking, and cloud architecture.",
      "Acme",
      "Solutions Engineer",
    );

    expect(evidence.map((item) => item.id)).toContain("profile:project:discovery-poc");
  });

  test("accepts a grounded draft and reports useful metrics", () => {
    const review = reviewApplicationDraft(validApplicationDraft(), brief);
    expect(review.pass).toBe(true);
    expect(review.metrics.evidenceItemsUsed).toBeGreaterThan(4);
    expect(review.metrics.keywordCoverage).toBe(1);
  });

  test("rejects unknown evidence and unsupported numbers", () => {
    const draft = validApplicationDraft();
    draft.cv.experience[0].bullets[0] = {
      text: "Automated 99 cloud environments.",
      evidenceIds: ["profile:experience:0:missing"],
    };
    const review = reviewApplicationDraft(draft, brief);
    expect(review.pass).toBe(false);
    expect(review.findings.map((item) => item.code)).toContain("UNKNOWN_EVIDENCE");
    expect(review.findings.map((item) => item.code)).toContain("UNSUPPORTED_NUMBER");
  });

  test("rejects a genuine profile gap when rewritten as a candidate claim", () => {
    const draft = validApplicationDraft();
    draft.cv.skills.push({ text: "Kubernetes", evidenceIds: ["profile:skill:0:0"] });
    const review = reviewApplicationDraft(draft, brief);
    expect(review.pass).toBe(false);
    expect(review.findings.map((item) => item.code)).toContain("GAP_AS_CLAIM");
  });

  // Hard rule 1 requires gaps to stay visible. Scanning the whole document for
  // gap terms made an honest disclosure indistinguishable from a claim, so the
  // only way past the gate was to say nothing about the gap at all.
  test("allows a declared gap to be disclosed in the cover letter", () => {
    const draft = validApplicationDraft();
    draft.coverLetter.paragraphs[0] = {
      text: "My orchestration experience is Docker Swarm rather than Kubernetes, which I would need to learn.",
      evidenceIds: ["profile:skill:0:0"],
    };
    const review = reviewApplicationDraft(draft, brief);
    expect(review.findings.map((item) => item.code)).not.toContain("GAP_AS_CLAIM");
  });

  test("a declared gap is still rejected on the CV itself", () => {
    const draft = validApplicationDraft();
    draft.cv.experience[0].bullets.push({
      text: "Ran Kubernetes clusters in production.",
      evidenceIds: ["profile:experience:0"],
    });
    const review = reviewApplicationDraft(draft, brief);
    expect(review.pass).toBe(false);
    expect(review.findings.map((item) => item.code)).toContain("GAP_AS_CLAIM");
  });

  // Project matching decides which portfolio work is the right evidence for a
  // posting. The CV is where that decision has to actually show up.
  test("accepts projects that project matching put in the ledger", () => {
    const draft = validApplicationDraft();
    draft.cv.projects = [
      {
        slug: "delivery-pipeline",
        description: { text: "Reusable deployment pipeline for platform teams.", evidenceIds: ["profile:project:delivery-pipeline"] },
        highlights: [{ text: "Built with Python and Terraform.", evidenceIds: ["profile:project:delivery-pipeline"] }],
      },
    ];
    const review = reviewApplicationDraft(draft, brief);
    expect(review.pass).toBe(true);
  });

  test("rejects a project the matcher never selected", () => {
    const draft = validApplicationDraft();
    draft.cv.projects = [
      {
        slug: "unrelated-side-project",
        description: { text: "Something else entirely.", evidenceIds: ["profile:experience:0"] },
        highlights: [],
      },
    ];
    const review = reviewApplicationDraft(draft, brief);
    expect(review.pass).toBe(false);
    expect(review.findings.map((item) => item.code)).toContain("UNKNOWN_PROJECT");
  });

  test("a gap named inside a project description is still caught", () => {
    const draft = validApplicationDraft();
    draft.cv.projects = [
      {
        slug: "delivery-pipeline",
        description: { text: "Deployment pipeline running on Kubernetes.", evidenceIds: ["profile:project:delivery-pipeline"] },
        highlights: [],
      },
    ];
    const review = reviewApplicationDraft(draft, brief);
    expect(review.pass).toBe(false);
    expect(review.findings.map((item) => item.code)).toContain("GAP_AS_CLAIM");
  });

  test("the prompt tells the model the projects section exists", () => {
    expect(brief.prompt).toContain("profile:project:<slug>");
  });

  // Issue #6: describing the employer's requirement is not a candidate claim.
  describe("attributed employer requirements", () => {
    const letterWith = (text: string, declare = false) => {
      const draft = validApplicationDraft();
      draft.strategy.honestGaps = declare ? ["Kubernetes"] : [];
      draft.coverLetter.paragraphs[0] = { text, evidenceIds: ["profile:skill:0:0"] };
      return reviewApplicationDraft(draft, brief).findings.map((item) => item.code);
    };

    test("a sentence that only attributes the requirement to the posting passes", () => {
      expect(letterWith("Your posting asks for Kubernetes at scale. My delivery work uses Python and Terraform.")).not.toContain("GAP_AS_CLAIM");
      expect(letterWith("You are looking for someone who has run Kubernetes in production.")).not.toContain("GAP_AS_CLAIM");
      expect(letterWith('The role lists "Kubernetes" as a must-have.')).not.toContain("GAP_AS_CLAIM");
    });

    test("attribution does not excuse a first-person claim in the same sentence", () => {
      expect(letterWith("The role requires Kubernetes, and I have run it in production.")).toContain("GAP_AS_CLAIM");
      expect(letterWith("Your team needs Kubernetes; my background covers it.")).toContain("GAP_AS_CLAIM");
    });

    test("an unattributed claim still fails", () => {
      expect(letterWith("Kubernetes is where I do my best work.")).toContain("GAP_AS_CLAIM");
    });

    // Issue #13: declaring the gap licensed any letter sentence that named it.
    test("a declared gap licenses disclosure, not an affirmative claim", () => {
      expect(letterWith("I have run Kubernetes in production for years.", true)).toContain("GAP_AS_CLAIM");
      expect(letterWith("Kubernetes is where I do my best work.", true)).toContain("GAP_AS_CLAIM");
      expect(letterWith("I have not run Kubernetes in production yet and would need to learn it.", true)).not.toContain("GAP_AS_CLAIM");
      expect(letterWith("My orchestration experience is Docker Swarm rather than Kubernetes.", true)).not.toContain("GAP_AS_CLAIM");
      expect(letterWith("Your posting asks for Kubernetes at scale.", true)).not.toContain("GAP_AS_CLAIM");
      expect(letterWith("The role requires Kubernetes, and I have run it for years.", true)).toContain("GAP_AS_CLAIM");
    });

    test("the CV gets no attribution latitude", () => {
      const draft = validApplicationDraft();
      draft.cv.summary = { text: `${draft.cv.summary.text} The posting asks for Kubernetes.`, evidenceIds: draft.cv.summary.evidenceIds };
      expect(reviewApplicationDraft(draft, brief).findings.map((item) => item.code)).toContain("GAP_AS_CLAIM");
    });
  });

  test("an undeclared gap is rejected even in the cover letter", () => {
    const draft = validApplicationDraft();
    draft.strategy.honestGaps = [];
    draft.coverLetter.paragraphs[0] = {
      text: "My orchestration experience is Docker Swarm rather than Kubernetes, which I would need to learn.",
      evidenceIds: ["profile:skill:0:0"],
    };
    const review = reviewApplicationDraft(draft, brief);
    expect(review.pass).toBe(false);
    expect(review.findings.map((item) => item.code)).toContain("GAP_AS_CLAIM");
  });
});

describe("application Typst renderers", () => {
  test("escape string boundaries once", () => {
    expect(typstString('Acme "Cloud" \\ Platform')).toBe('Acme \\"Cloud\\" \\\\ Platform');
  });

  test("puts selected projects on the CV, with name and link from the profile", () => {
    const draft = validApplicationDraft();
    draft.cv.projects = [
      {
        slug: "delivery-pipeline",
        description: { text: "Reusable deployment pipeline for platform teams.", evidenceIds: ["profile:project:delivery-pipeline"] },
        highlights: [{ text: "Built with Python and Terraform.", evidenceIds: ["profile:project:delivery-pipeline"] }],
      },
    ];
    const cv = renderCvTypst({ profile: applicationProfile, draft, outDir: "/tmp/application", template: "modern" });
    expect(cv).toContain("Delivery Pipeline");
    expect(cv).toContain("https://example.com/delivery-pipeline");
    expect(cv).toContain("Built with Python and Terraform.");
    expect(cv).not.toContain("projects: ()");
  });

  test("refuses a project slug the profile does not have", () => {
    const draft = validApplicationDraft();
    draft.cv.projects = [
      { slug: "ghost", description: { text: "x", evidenceIds: ["profile:project:delivery-pipeline"] }, highlights: [] },
    ];
    expect(() => renderCvTypst({ profile: applicationProfile, draft, outDir: "/tmp/application", template: "modern" })).toThrow(/ghost/);
  });

  // The German market puts education before work experience. Before this, the
  // convention reached the drafting prompt but never the renderer, so a German
  // CV rendered experience-first regardless.
  test("section order follows the market, not the template", () => {
    const draft = validApplicationDraft();
    const german = renderCvTypst({ profile: applicationProfile, draft, outDir: "/tmp/application", template: "modern", market: "de" });
    const israeli = renderCvTypst({ profile: applicationProfile, draft, outDir: "/tmp/application", template: "modern", market: "il" });
    const none = renderCvTypst({ profile: applicationProfile, draft, outDir: "/tmp/application", template: "modern" });
    expect(german).toContain("education-first: true");
    expect(israeli).toContain("education-first: false");
    expect(none).toContain("education-first: false");
  });

  test("uses a photo only when the selected template has an avatar slot", () => {
    const withPhoto = renderCvTypst({ profile: applicationProfile, draft: validApplicationDraft(), outDir: "/tmp/application", template: "modern", layout: "modern", supportsAvatar: true, photo: resolve(import.meta.dir, "../assets/readme/hero.png") });
    const withoutPhoto = renderCvTypst({ profile: applicationProfile, draft: validApplicationDraft(), outDir: "/tmp/application", template: "modern", layout: "modern", supportsAvatar: false, photo: resolve(import.meta.dir, "../assets/readme/hero.png") });
    expect(withPhoto).toContain("assets/readme/hero.png");
    expect(withoutPhoto).toContain("photo: \"\"");
  });

  test("render both documents from the same validated draft", () => {
    const draft = validApplicationDraft();
    const cv = renderCvTypst({ profile: applicationProfile, draft, outDir: "/tmp/application", template: "modern" });
    const cover = renderCoverLetterTypst({ profile: applicationProfile, draft, outDir: "/tmp/application", template: "modern", date: "2026-07-18" });
    expect(cv).toContain("Automated cloud environment delivery");
    expect(cv).not.toContain("profile:experience");
    expect(cover).toContain("Acme needs a platform engineer");
    expect(cover).toContain('date: "2026-07-18"');
    expect(cover).not.toContain("measurable outcomes");
  });
});

// Owner E2E run (2026-10-02): client cases with no confirmed employer were
// written as bullets under the current role, which says they were done there.
describe("employer attribution", () => {
  const withProjectBullet = () => {
    const draft = validApplicationDraft();
    draft.cv.experience[0].bullets.push({ text: "Built a reusable deployment pipeline for platform teams.", evidenceIds: ["profile:project:delivery-pipeline"] });
    return draft;
  };

  test("a project with no confirmed employer cannot be a bullet under a role", () => {
    const brief = buildApplicationBrief({ profile: applicationProfile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
    expect(brief.evidence.find((item) => item.id === "profile:project:delivery-pipeline")?.text).toContain("Employer: not confirmed");
    const findings = reviewApplicationDraft(withProjectBullet(), brief).findings;
    expect(findings.find((f) => f.code === "EMPLOYER_UNCONFIRMED")?.path).toBe("cv.experience.0.bullets.2");
  });

  test("a project linked to the role by engagementId may be", () => {
    const profile = structuredClone(applicationProfile);
    profile.experience![0].id = "labs";
    profile.projects![0].engagementId = "labs";
    const brief = buildApplicationBrief({ profile, posting: applicationPosting, company: "Acme", role: "Platform Engineer" });
    expect(brief.evidence.find((item) => item.id === "profile:project:delivery-pipeline")?.text).toContain("Employer: Example Labs");
    expect(reviewApplicationDraft(withProjectBullet(), brief).findings.map((f) => f.code)).not.toContain("EMPLOYER_UNCONFIRMED");
  });
});
