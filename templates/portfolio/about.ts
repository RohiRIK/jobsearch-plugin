import type { PortfolioTemplate, PortfolioData } from "../../src/portfolio-templates.js";
import { esc, buildLinks, safePortfolioHref } from "../../src/portfolio-templates.js";

// ─── Accessible outline icons ──────────────────────────────────────────────
// Inline, inert SVG markup: no external requests, no scripts, no external
// stylesheets. Every icon is non-focusable and hidden from assistive tech; the
// visible section heading text carries the meaning.
function icon(name: string): string {
  const shapes: Record<string, string> = {
    about: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a7 7 0 0 1 14 0v2"/>',
    work: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 12h18M12 10v4"/>',
    personal: '<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    skills: '<polyline points="8 5 2 12 8 19"/><polyline points="16 5 22 12 16 19"/><path d="m14 3-4 18"/>',
    lab: '<path d="M9 3h6M10 3v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10"/>',
    experience: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    education: '<polygon points="2 9 12 4 22 9 12 14"/><path d="M6 11v6c4 3 8 3 12 0v-6M22 9v8"/>',
    certifications: '<rect x="5" y="3" width="14" height="14" rx="2"/><path d="M9 7h6M9 11h6M9 17l-1 5 4-2 4 2-1-5"/>',
    interests: '<circle cx="12" cy="12" r="9"/><polygon points="16 8 14 14 8 16 10 10"/>',
  };
  return shapes[name] ? `<svg class="icon icon--${name}" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${shapes[name]}</svg>` : "";
}

// ─── Section helper with outline icon ─────────────────────────────────────
function sectionWithIcon(
  name: string,
  iconName: string,
  hasData: boolean,
  body: string,
  placeholder: string,
  populated: string[],
  placeholders: string[],
): string {
  (hasData ? populated : placeholders).push(name);
  return `<section class="section"><h2 class="section-heading">${icon(iconName)}<span>${esc(name)}</span></h2>${hasData ? body : `<p class="placeholder">${esc(placeholder)}</p>`}</section>`;
}

// ─── Project card ─────────────────────────────────────────────────────────
function projectCard(project: NonNullable<PortfolioData["profile"]["projects"]>[number]): string {
  project = { ...project, link: safePortfolioHref(project.link ?? "") };
  const kindLabel = project.kind === "work" ? "Client work" : "Personal";
  const iconName = project.kind === "work" ? "work" : "personal";
  const domains = (project.domains ?? []).map((domain) => `<span class="tag">${esc(domain)}</span>`).join("");
  const stack = (project.stack ?? []).map((item) => `<span class="stack">${esc(item)}</span>`).join("");
  const title = project.link ? `<a class="project-link" href="${esc(project.link)}">${esc(project.name)}</a>` : esc(project.name);
  const meta = project.kind ? `<span class="project-kind">${esc(kindLabel)}</span>` : "";
  return `<article class="portfolio-project"><div class="project-head">${icon(iconName)}<h3>${title}</h3>${meta}</div><p>${esc(project.summary)}</p>${project.impact ? `<p class="impact"><strong>Outcome:</strong> ${esc(project.impact)}</p>` : ""}${domains ? `<div class="tags">${domains}</div>` : ""}${stack ? `<div class="stack-row">${stack}</div>` : ""}${project.link && !project.link.startsWith("mailto") ? `<p class="project-link"><a href="${esc(project.link)}">Read the project write-up &rarr;</a></p>` : ""}</article>`;
}

// ─── Project section (client work vs personal, honest disclosure gates) ───
function projectSection(
  title: string,
  iconName: string,
  projects: NonNullable<PortfolioData["profile"]["projects"]>,
  kind: "work" | "personal",
  populated: string[],
  placeholders: string[],
): string {
  const visible = projects.filter(
    (project) => project.kind === kind && project.disclosure !== "restricted" && project.disclosure !== "unreviewed",
  );
  return sectionWithIcon(
    title,
    iconName,
    visible.length > 0,
    visible.map(projectCard).join(""),
    "No approved projects in this category yet. Review project disclosure before publishing.",
    populated,
    placeholders,
  );
}

export const aboutTemplate: PortfolioTemplate = {
  name: "about",
  description: "Clean white portfolio with purple outline icons: about, selected client and personal work, skills, experience, education and certifications. Self-contained; no external runtime requests or scripts.",

  render(data: PortfolioData): { html: string; populated: string[]; placeholders: string[] } {
    const { profile, repos, maxRepos } = data;
    const id = profile.identity ?? {};
    const populated: string[] = [];
    const placeholders: string[] = [];
    const links = buildLinks(id);

    const skills = profile.skills ?? [];
    const skillsBody = skills
      .map(
        (c) =>
          `<div class="skill-group"><h4>${esc(c.category)}</h4><ul>${c.skills.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>`,
      )
      .join("");

    // Adjacent / lab skills kept honestly separate from core capabilities.
    const adjacent = profile.adjacentSkills ?? [];
    const adjacentBody = adjacent
      .map(
        (c) =>
          `<div class="skill-group"><h4>${esc(c.category)}</h4><p class="note">Adjacent / lab — not core capability evidence.</p><ul>${c.skills.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>`,
      )
      .join("");

    const experience = profile.experience ?? [];
    const expBody = experience
      .map(
        (e) =>
          `<article><h3>${esc(e.title ?? "")} <span class="at">\u2014</span> ${esc(e.company ?? "")}</h3><p class="meta">${esc(e.startDate ?? "")}${e.endDate ? ` \u2013 ${esc(e.endDate)}` : " \u2013 present"}</p>${(e.responsibilities ?? []).map((r) => `<p>${esc(r)}</p>`).join("")}</article>`,
      )
      .join("");

    const education = profile.education ?? [];
    const eduBody = education
      .map(
        (e) =>
          `<article><h3>${esc(e.institution ?? "")}</h3><p>${esc(e.degree ?? "")}</p>${e.field ? `<p class="meta">${esc(e.field)}</p>` : ""}${e.startYear || e.endYear ? `<p class="meta">${esc([e.startYear, e.endYear].filter(Boolean).join("–"))}</p>` : ""}</article>`,
      )
      .join("");

    const certifications = profile.certifications ?? [];
    const certBody = certifications
      .map(
        (c) =>
          `<article><h3>${esc(c.name)}</h3><p class="meta">${esc(c.date ?? "")}</p>${c.hours != null ? `<p class="meta">${c.hours} hours</p>` : ""}</article>`,
      )
      .join("");

    const repoBody = repos
      .slice(0, maxRepos)
      .map((r) => {
        const url = safePortfolioHref(r.html_url ?? r.url ?? "");
        const name = r.name ?? "unnamed";
        return `<article><h3>${url ? `<a href="${esc(url)}">${esc(name)}</a>` : esc(name)}</h3><p>${esc(r.description ?? "")}</p>${r.language ? `<p class="meta">${esc(r.language)}</p>` : ""}</article>`;
      })
      .join("");

    // Identity block (about): headline + contact + location + languages + interests.
    const identityLines: string[] = [];
    if (id.location) identityLines.push(`<p class="meta"><span class="meta-label">Location:</span> ${esc(id.location)}</p>`);
    if (id.email) identityLines.push(`<p class="meta"><span class="meta-label">Email:</span> <a href="mailto:${esc(id.email)}">${esc(id.email)}</a></p>`);
    if (id.phone) identityLines.push(`<p class="meta"><span class="meta-label">Phone:</span> ${esc(id.phone)}</p>`);
    if (id.languages?.length) identityLines.push(`<p class="meta"><span class="meta-label">Languages:</span> ${esc(id.languages.join(", "))}</p>`);
    const interests = profile.interests ?? [];
    const interestsBody = interests.length > 0 ? `<p>${esc(interests.join(", "))}</p>` : "";

    const linksHtml = links
      .map((l) => `<a class="link" href="${esc(l.href)}">${esc(l.label)}</a>`)
      .join("");

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(id.name ?? "Portfolio")}</title>
<style>
:root {
  --bg: #ffffff;
  --surface: #faf8ff;
  --ink: #1a1a1a;
  --muted: #5b5b6e;
  --line: #e5e5ea;
  --purple: #9745f7;
  --purple-soft: #f3e8ff;
  --text: #242430;
  --radius: 6px;
  --purple-rgb: 151, 69, 247;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f14;
    --surface: #17171d;
    --ink: #e8e8f0;
    --muted: #9b9bb0;
    --line: #2a2a36;
    --purple: #a78bfa;
    --purple-soft: #1c1b33;
    --text: #f3f3f9;
  }
}
* { box-sizing: border-box; margin: 0; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  color: var(--ink);
  background: var(--bg);
  font-size: 15px;
  line-height: 1.6;
  margin: 0;
}
.wrap {
  max-width: 1100px;
  margin: 0 auto;
  padding: clamp(1.5rem, 4vw, 3rem) 1rem 4rem;
}
header.profile-header {
  margin-bottom: 2.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--line);
}
.header-inner {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.icon {
  display: inline-block;
  vertical-align: middle;
}
h1 {
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin: 0 0 0.4rem 0;
}
h1 .icon { margin-right: 0.5rem; }
.headline {
  color: var(--muted);
  margin: 0 0 0.9rem 0;
  font-size: 1.05rem;
}
nav {
  display: flex;
  gap: 0.85rem;
  flex-wrap: wrap;
  margin-top: 0.6rem;
}
nav a {
  color: var(--purple);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  border: 1px solid var(--purple);
  border-radius: 999px;
  padding: 0.18rem 0.6rem;
}
nav a:hover { background: var(--purple-soft); }
a.link { color: var(--purple); text-decoration: none; }
a.link:hover { text-decoration: underline; }

.section { margin-top: 2.75rem; }
.section-heading {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink);
  margin: 0 0 0.9rem 0;
  border-bottom: 2px solid var(--purple);
  padding-bottom: 0.45rem;
  max-width: fit-content;
}
.section-heading .icon { stroke: var(--purple); width: 15px; height: 15px; flex-shrink: 0; }
.section-heading span { color: var(--ink); }

p { margin: 0 0 0.75rem 0; color: var(--text); }
p.meta { color: var(--muted); font-size: 0.9rem; margin-top: 0.35rem; }
.meta-label { font-weight: 600; color: var(--muted); }

article {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 0.95rem 1.1rem;
  margin-bottom: 0.85rem;
}
article h3 {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 0.35rem 0;
}
article h3 .at { color: var(--muted); font-weight: 500; }
article p { margin-top: 0.5rem; }
article p:first-child { margin-top: 0; }
.impact { color: var(--ink); }

.skill-group { margin-bottom: 0.75rem; }
.skill-group h4 {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
  margin: 0 0 0.4rem 0;
}
.skill-group ul { list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0; margin: 0; }
.skill-group li {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.18rem 0.6rem;
  font-size: 0.88rem;
  color: var(--text);
}
.note { color: var(--muted); font-size: 0.8rem; font-style: italic; margin-top: 0.25rem; }

.tags, .stack-row { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.8rem; }
.tag, .stack { font-size: 0.75rem; border-radius: 5px; padding: 0.14rem 0.5rem; }
.tag { color: var(--purple); border: 1px solid var(--purple); background: var(--purple-soft); }
.stack { color: var(--muted); border: 1px solid var(--line); background: var(--bg); }

.project-kind {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--purple);
  border: 1px solid var(--purple);
  border-radius: 999px;
  padding: 0.12rem 0.5rem;
  margin-left: auto;
  white-space: nowrap;
}
.project-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.55rem; flex-wrap: wrap; }
.project-head h3 { margin: 0; font-size: 1.05rem; }
.project-head .icon { stroke: var(--purple); width: 14px; height: 14px; flex-shrink: 0; }
.project-link { font-size: 0.85rem; color: var(--purple); text-decoration: none; }
.project-link:hover { text-decoration: underline; }

p.placeholder { color: var(--muted); font-style: italic; font-size: 0.9rem; }
footer {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.78rem;
}

/* Responsive: 390px mobile and 1440px desktop */
@media (max-width: 390px) {
  .wrap { padding: clamp(1rem, 3vw, 2rem) 0.75rem 2.5rem; }
  header.profile-header { margin-bottom: 1.75rem; padding-bottom: 1rem; }
  .header-inner { display: block; text-align: center; }
  h1 .icon { margin-right: 0; display: block; margin: 0 auto 0.4rem; }
  nav { justify-content: center; }
  .section-heading { justify-content: center; text-align: center; }
  .section-heading .icon { margin: 0 auto 0.3rem 0; }
  .project-head { display: block; }
  .project-kind { margin-left: 0; margin-top: 0.35rem; }
  .wrap { max-width: 100%; }
}
@media (min-width: 1440px) {
  .wrap { max-width: 1200px; padding-left: 2rem; padding-right: 2rem; }
}

/* ─── Print: A4, ordinary block flow, no clipping ──────────────────────── */
@media print {
  @page { size: A4; margin: 12mm 14mm; }
  * { background: transparent !important; color: #000 !important; box-shadow: none !important; text-shadow: none !important; }
  body { background: #fff !important; color: #000 !important; font-size: 9.5pt; line-height: 1.45; padding: 0 !important; margin: 0 !important; }
  .wrap { max-width: 100% !important; padding: 0 !important; border: none !important; }
  header.profile-header { display: block; border: none; margin-bottom: 14mm; padding: 0; }
  .header-inner { display: block; text-align: left; }
  h1 { font-size: 17pt; margin: 0 0 3mm 0; page-break-after: avoid; }
  h1 .icon { display: inline; width: 9pt; height: 9pt; margin-right: 2mm; vertical-align: middle; }
  .headline { font-size: 9.5pt; margin: 0 0 2mm 0; }
  nav { display: block; margin-top: 1.5mm; }
  nav a { display: inline-block; border: none; color: #000; text-decoration: underline; padding: 0; background: none !important; margin-right: 4mm; }
  nav a::after { content: " (" attr(href) ")"; font-size: 8pt; color: #555; }
  .section { margin-top: 7mm; page-break-inside: auto; }
  .section-heading { display: block; border: none; font-size: 10pt; margin: 0 0 2.5mm 0; padding: 0; max-width: none; page-break-after: avoid; }
  .section-heading .icon { display: inline-block; width: 8pt; height: 8pt; margin-right: 1.5mm; vertical-align: middle; stroke: #000; }
  .section-heading span { color: #000; }
  .section-heading { border-bottom: 0.6pt solid #000; padding-bottom: 1mm; }
  p { font-size: 9.5pt; margin: 0 0 1.8mm 0; }
  p.meta { font-size: 8.5pt; }
  article { background: none !important; border: 0.4pt solid #999; border-radius: 2px; padding: 2mm 2.5mm; margin-bottom: 2mm; page-break-inside: avoid; }
  article h3 { font-size: 10pt; margin: 0 0 1mm 0; }
  article p { margin: 0 0 1mm 0; font-size: 9pt; }
  .skill-group { margin-bottom: 1.5mm; page-break-inside: avoid; }
  .skill-group h4 { font-size: 8.5pt; margin: 0 0 1mm 0; }
  .skill-group ul { display: block; }
  .skill-group li { display: inline-block; border: 0.4pt solid #999; background: none !important; padding: 0.5mm 1.5mm; margin: 0 1mm 1mm 0; font-size: 8pt; }
  .tags, .stack-row { display: block; margin-top: 1mm; }
  .tag, .stack { display: inline-block; border: 0.4pt solid #999; background: none !important; padding: 0.5mm 1.5mm; margin: 0 1mm 1mm 0; font-size: 7.5pt; color: #000; }
  .portfolio-project { page-break-inside: avoid; margin-bottom: 2.5mm; }
  .project-kind { display: block; border: none; color: #000; font-size: 7pt; margin-top: 1mm; padding: 0; }
  .project-head { display: block; margin-bottom: 1mm; }
  .project-head h3 { font-size: 9.5pt; margin: 0; }
  .project-head .icon { width: 7pt; height: 7pt; margin-right: 1mm; stroke: #000; }
  .icon { stroke: #9745f7 !important; color: #9745f7 !important; width: 8pt; height: 8pt; }
  .icon * { stroke: #9745f7 !important; fill: none !important; }
  .no-print, .print-hide, nav, footer { display: none !important; }
  * { position: static !important; }
  html, body { overflow: visible !important; height: auto !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>
<div class="wrap">
<header class="profile-header">
  <div class="header-inner">
    <h1>${icon("about")}${esc(id.name ?? "Your Name")}</h1>
    ${id.headline ? `<p class="headline">${esc(id.headline)}</p>` : ""}
    <nav>${linksHtml}</nav>
  </div>
  ${identityLines.join("")}
</header>
<main>
${sectionWithIcon("About", "about", identityLines.length > 0, identityLines.join(""), "No identity details recorded yet.", populated, placeholders)}
${interests.length > 0 ? `<section class="section"><h2 class="section-heading">${icon("interests")}<span>Interests</span></h2>${interestsBody}</section>` : ""}
${projectSection("Client work", "work", profile.projects ?? [], "work", populated, placeholders)}
${projectSection("Personal projects", "personal", profile.projects ?? [], "personal", populated, placeholders)}
${sectionWithIcon("Skills", "skills", skills.length > 0, skillsBody, "No skills recorded yet.", populated, placeholders)}
${adjacent.length > 0 ? sectionWithIcon("Adjacent skills (lab)", "lab", true, adjacentBody, "", populated, placeholders) : ""}
${sectionWithIcon("Experience", "experience", experience.length > 0, expBody, "No experience recorded yet.", populated, placeholders)}
${sectionWithIcon("Education", "education", education.length > 0, eduBody, "No education recorded yet.", populated, placeholders)}
${sectionWithIcon("Certifications", "certifications", certifications.length > 0, certBody, "No certifications recorded yet.", populated, placeholders)}
${repos.length > 0 ? sectionWithIcon("Open source", "about", true, repoBody, "No GitHub data staged.", populated, placeholders) : ""}
</main>
<footer>Generated from the candidate profile. Empty sections stay honest; restricted or unreviewed projects are not published.</footer>
</div>
</body>
</html>`;

    return { html, populated, placeholders };
  },
};
