import { describe, expect, test } from "bun:test";
import { TEMPLATES, getTemplate, listTemplates, DEFAULT_TEMPLATE, type PortfolioData } from "../src/portfolio-templates.js";
import { Profile } from "../src/profile-schemas.js";

const PROFILE = Profile.parse({
  identity: {
    name: "Example Person",
    headline: "Software Engineer",
    email: "person@example.com",
    github: "https://github.com/example",
    linkedin: "https://linkedin.com/in/example",
    location: "Example City",
    languages: ["English", "French"],
  },
  skills: [
    { category: "Languages", skills: ["TypeScript", "Python"] },
    { category: "Tools", skills: ["Terraform", "Docker"] },
  ],
  adjacentSkills: [{ category: "Lab", skills: ["Rust", "OCaml"] }],
  experience: [
    {
      title: "Engineer",
      company: "Acme",
      startDate: "2020",
      endDate: "Present",
      responsibilities: ["Built things", "Shipped things"],
    },
  ],
  education: [{ degree: "BSc", field: "CS", institution: "Example University" }],
  certifications: [{ name: "Cloud Fundamentals", date: "2023", hours: 40 }],
  interests: ["Trail running", "Home lab"],
  projects: [
    {
      slug: "client-one",
      name: "Client Delivery Platform",
      kind: "work",
      summary: "Reusable deployment pipeline for platform teams.",
      domains: ["devops-platform"],
      stack: ["Python", "Terraform"],
      link: "https://example.com/client-one",
      disclosure: "approved",
    },
    {
      slug: "client-restricted",
      name: "Restricted Client Work",
      kind: "work",
      summary: "Must not appear.",
      domains: [],
      stack: [],
      disclosure: "restricted",
    },
    {
      slug: "personal-one",
      name: "Home Lab Dashboard",
      kind: "personal",
      summary: "A personal monitoring dashboard.",
      domains: ["homelab"],
      stack: ["TypeScript"],
      link: "https://example.com/personal-one",
      disclosure: "approved",
    },
    {
      slug: "personal-unreviewed",
      name: "Unreviewed Idea",
      kind: "personal",
      summary: "Must not appear.",
      domains: [],
      stack: [],
      disclosure: "unreviewed",
    },
  ],
});

const DATA: PortfolioData = { profile: PROFILE, repos: [], maxRepos: 12 };

describe("portfolio about template", () => {
  test("registers about as a selectable template", () => {
    const names = listTemplates().map((t) => t.name);
    expect(names).toContain("about");
    expect(names.length).toBe(5);
    const t = getTemplate("about");
    expect(t.name).toBe("about");
    expect(t.description.length).toBeGreaterThan(10);
    expect(DEFAULT_TEMPLATE).toBe("showcase");
  });

  test("renders valid self-contained HTML with the profile name", () => {
    const { html } = getTemplate("about").render(DATA);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Example Person");
    // No external runtime requests or scripts.
    expect(html).not.toMatch(/<script\b/);
    expect(html).not.toMatch(/href="[^"]*\.css"/);
    expect(html).not.toMatch(/src="[^"]*\.js"/);
    // No hardcoded personal data or website assets.
    expect(html).not.toContain("rohi");
    expect(html).not.toContain("rikman");
    expect(html).not.toMatch(/https?:\/\/[^"]*\.(png|jpg|jpeg|gif|webp|svg)/);
  });

  test("output API matches {html, populated, placeholders}", () => {
    const result = getTemplate("about").render(DATA);
    expect(Object.keys(result).sort()).toEqual(["html", "placeholders", "populated"]);
    expect(typeof result.html).toBe("string");
    expect(Array.isArray(result.populated)).toBe(true);
    expect(Array.isArray(result.placeholders)).toBe(true);
  });

  test("renders semantic headings and sections", () => {
    const { html } = getTemplate("about").render(DATA);
    expect(html).toMatch(/<h1[^>]*>.*Example Person<\/h1>/);
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).toContain("<section");
  });

  test("includes consistent accessible outline icons (inert SVG)", () => {
    const { html } = getTemplate("about").render(DATA);
    expect(html).toMatch(/<svg[^>]*class="icon/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).not.toMatch(/<script/);
    // Section headings carry icons.
    expect(html).toContain('icon--about');
    expect(html).toContain('icon--skills');
    expect(html).toContain('icon--experience');
    expect(html).toContain('icon--education');
    expect(html).toContain('icon--certifications');
    // SVG graphics elements are leaves, never invalid nested path/circle trees.
    expect(html).not.toMatch(/<(?:path|circle|rect|polyline|polygon)\b[^>]*[^\/]>\s*</);
    const unsafe = structuredClone(PROFILE);
    unsafe.projects![0].link = "javascript:alert(1)";
    expect(getTemplate("about").render({ ...DATA, profile: unsafe }).html).not.toContain('href="javascript:');
  });

  test("renders client work and personal projects separately with .portfolio-project marker", () => {
    const { html, populated } = getTemplate("about").render(DATA);
    expect(html).toContain("Client work");
    expect(html).toContain("Client Delivery Platform");
    expect(html).toContain("Personal projects");
    expect(html).toContain("Home Lab Dashboard");
    // Restricted / unreviewed never appear.
    expect(html).not.toContain("Restricted Client Work");
    expect(html).not.toContain("Unreviewed Idea");
    // Count verification marker on every project article.
    expect((html.match(/class="portfolio-project"/g) ?? []).length).toBe(2);
    expect(populated).toContain("Client work");
    expect(populated).toContain("Personal projects");
  });

  test("renders all skill categories and keeps lab/adjacent skills separate", () => {
    const { html } = getTemplate("about").render(DATA);
    expect(html).toContain("Languages");
    expect(html).toContain("TypeScript");
    expect(html).toContain("Tools");
    expect(html).toContain("Terraform");
    // Adjacent / lab skills separated honestly, not inflated into core.
    expect(html).toContain("Adjacent skills (lab)");
    expect(html).toContain("Rust");
    expect(html).toContain("OCaml");
    expect(html).toContain("note");
    expect(html).toContain("not core capability evidence");
  });

  test("renders experience, education and certifications", () => {
    const { html } = getTemplate("about").render(DATA);
    expect(html).toContain("Experience");
    expect(html).toContain("Engineer");
    expect(html).toContain("Acme");
    expect(html).toContain("Education");
    expect(html).toContain("BSc");
    expect(html).toContain("Example University");
    expect(html).toContain("Certifications");
    expect(html).toContain("Cloud Fundamentals");
    expect(html).toContain("40 hours");
  });

  test("renders available identity and interests; never manufactures missing content", () => {
    const full = structuredClone(PROFILE);
    full.experience![0].responsibilities = ["First duty", "Second duty", "Third duty", "Fourth duty", "Fifth duty must survive"];
    const all = getTemplate("about").render({ ...DATA, profile: full }).html;
    expect(all).toContain("Fifth duty must survive");
    full.education![0].startYear = 2019;
    full.education![0].endYear = 2022;
    expect(getTemplate("about").render({ ...DATA, profile: full }).html).toContain("2019–2022");
    const { html } = getTemplate("about").render(DATA);
    expect(html).toContain("Example City");
    expect(html).toContain("person@example.com");
    expect(html).toContain("English");
    expect(html).toContain("Interests");
    expect(html).toContain("Trail running");
    expect(html).toContain("Home lab");
  });

  test("shows honest placeholders when data is missing", () => {
    const empty = Profile.parse({ identity: { name: "Empty" } });
    const { html, populated, placeholders } = getTemplate("about").render({
      profile: empty,
      repos: [],
      maxRepos: 12,
    });
    expect(html).toContain("Empty");
    expect(populated.length).toBe(0);
    expect(placeholders.length).toBeGreaterThan(0);
    expect(html).toContain("No identity details recorded yet.");
    expect(html).toContain("placeholder");
  });

  test("print CSS uses ordinary block flow with no sticky/flex/grid wrappers", () => {
    const { html } = getTemplate("about").render(DATA);
    expect(html).toContain("@media print");
    expect(html).toContain("size: A4");
    // Ordinary block flow in print: layout wrappers reset to block.
    expect(html).toContain("display: block");
    expect(html).toContain("position: static !important");
    // No fixed nav / skip links anywhere.
    expect(html).not.toContain("position: fixed");
    // No clipping wrappers.
    expect(html).not.toContain("overflow: hidden");
  });

  test("minimal responsive CSS references both 390px and 1440px", () => {
    const { html } = getTemplate("about").render(DATA);
    expect(html).toContain("@media (max-width: 390px)");
    expect(html).toContain("@media (min-width: 1440px)");
  });
});
