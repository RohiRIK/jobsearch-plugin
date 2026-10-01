import { describe, expect, test } from "bun:test";
import { TEMPLATES, getTemplate, listTemplates, DEFAULT_TEMPLATE, esc, buildLinks, type PortfolioData } from "../src/portfolio-templates.js";
import { Profile } from "../src/profile-schemas.js";

const MINIMAL_PROFILE: Profile = Profile.parse({
  identity: {
    name: "Test Person",
    headline: "Software Engineer",
    email: "test@example.com",
    github: "https://github.com/test",
  },
  skills: [{ category: "Languages", skills: ["TypeScript", "Python"] }],
  experience: [{ title: "Engineer", company: "Acme", startDate: "2020", responsibilities: ["Built things"] }],
  education: [{ degree: "BSc", field: "CS", institution: "MIT" }],
});

const MINIMAL_DATA: PortfolioData = { profile: MINIMAL_PROFILE, repos: [], maxRepos: 12 };

const REPO_DATA: PortfolioData = {
  profile: MINIMAL_PROFILE,
  repos: [{ name: "project-x", description: "A test project", html_url: "https://github.com/test/project-x", language: "TypeScript" }],
  maxRepos: 12,
};

describe("portfolio template registry", () => {
  test("listTemplates returns all 4 templates", () => {
    const names = listTemplates().map((t) => t.name);
    expect(names).toContain("modern");
    expect(names).toContain("minimal");
    expect(names).toContain("terminal");
    expect(names).toContain("showcase");
    expect(names.length).toBe(4);
  });

  test("getTemplate returns the named template", () => {
    for (const name of ["modern", "minimal", "terminal", "showcase"]) {
      const t = getTemplate(name);
      expect(t.name).toBe(name);
    }
  });

  test("getTemplate falls back to default for unknown names", () => {
    const t = getTemplate("nonexistent");
    expect(t.name).toBe(DEFAULT_TEMPLATE);
    expect(DEFAULT_TEMPLATE).toBe("showcase");
  });

  test("every template has a description", () => {
    for (const t of listTemplates()) {
      expect(t.description.length).toBeGreaterThan(10);
    }
  });
});

describe("esc helper", () => {
  test("escapes HTML special characters", () => {
    const amp = String.fromCharCode(38) + "amp;";
    const lt = String.fromCharCode(38) + "lt;";
    const gt = String.fromCharCode(38) + "gt;";
    const quot = String.fromCharCode(38) + "quot;";
    expect(esc("a & b")).toBe("a " + amp + " b");
    expect(esc("<script>")).toBe(lt + "script" + gt);
    expect(esc(String.fromCharCode(34) + "quote" + String.fromCharCode(34))).toBe(quot + "quote" + quot);
  });
});

describe("buildLinks helper", () => {
  test("builds links from identity", () => {
    const links = buildLinks(MINIMAL_PROFILE.identity!);
    expect(links.find((l) => l.label === "GitHub")).toBeDefined();
    expect(links.find((l) => l.label === "Email")).toBeDefined();
  });

  test("skips missing links", () => {
    const links = buildLinks({});
    expect(links.length).toBe(0);
  });
});

describe("template rendering", () => {
  test("every template produces valid HTML with all sections populated", () => {
    for (const name of ["modern", "minimal", "terminal"]) {
      const t = getTemplate(name);
      const { html, populated, placeholders } = t.render(REPO_DATA);
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("Test Person");
      expect(populated.length).toBe(4);
      expect(placeholders.length).toBe(0);
    }
  });

  test("every template shows placeholders when data is missing", () => {
    const emptyProfile = Profile.parse({ identity: { name: "Empty" } });
    const emptyData: PortfolioData = { profile: emptyProfile, repos: [], maxRepos: 12 };
    for (const name of ["modern", "minimal", "terminal"]) {
      const t = getTemplate(name);
      const { html, populated, placeholders } = t.render(emptyData);
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("Empty");
      expect(placeholders.length).toBe(4);
      expect(populated.length).toBe(0);
    }
  });

  test("every template includes repo links when repos present", () => {
    for (const name of ["modern", "minimal", "terminal"]) {
      const t = getTemplate(name);
      const { html } = t.render(REPO_DATA);
      expect(html).toContain("project-x");
      expect(html).toContain("https://github.com/test/project-x");
    }
  });

  test("templates are self-contained (no external file deps except Google Fonts)", () => {
    for (const name of ["modern", "minimal", "terminal", "showcase"]) {
      const t = getTemplate(name);
      const { html } = t.render(MINIMAL_DATA);
      // Should not reference any local .css or .js files
      expect(html).not.toMatch(/href="[^"]*\.css"/);
      expect(html).not.toMatch(/src="[^"]*\.js"/);
    }
  });

  test("showcase separates approved work and personal projects", () => {
    const profile = Profile.parse({
      ...MINIMAL_PROFILE,
      projects: [
        { slug: "client", name: "Client delivery", kind: "work", summary: "Client work", domains: ["cloud-security"], stack: ["Azure"], disclosure: "approved" },
        { slug: "private", name: "Private client work", kind: "work", summary: "Restricted", domains: [], stack: [], disclosure: "restricted" },
        { slug: "idea", name: "Unreviewed idea", kind: "personal", summary: "Not approved", domains: [], stack: [], disclosure: "unreviewed" },
      ],
    });
    const { html, populated, placeholders } = getTemplate("showcase").render({ profile, repos: [], maxRepos: 12 });
    expect(html).toContain("Client work");
    expect(html).toContain("Client delivery");
    expect(html).not.toContain("Private client work");
    expect(html).not.toContain("Unreviewed idea");
    expect(populated).toContain("Client work");
    expect(placeholders).toContain("Personal projects");
  });
});
