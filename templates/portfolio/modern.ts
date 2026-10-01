import type { PortfolioTemplate, PortfolioData } from "../../src/portfolio-templates.js";
import { esc, buildLinks, sectionWrapper } from "../../src/portfolio-templates.js";

export const modernTemplate: PortfolioTemplate = {
  name: "modern",
  description: "Inter + JetBrains Mono, OKLCH slate-indigo with amber accent, sharp 2px stance, light/dark themes",

  render(data: PortfolioData): { html: string; populated: string[]; placeholders: string[] } {
    const { profile, repos, maxRepos } = data;
    const id = profile.identity ?? {};
    const populated: string[] = [];
    const placeholders: string[] = [];

    const links = buildLinks(id);

    // \u2500\u2500 Skills \u2500\u2500
    const skills = profile.skills ?? [];
    const skillsBody = skills
      .map(
        (c) =>
          `<div class="skill-group"><h3>${esc(c.category)}</h3><ul>${c.skills.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>`
      )
      .join("");

    // \u2500\u2500 Experience \u2500\u2500
    const experience = profile.experience ?? [];
    const expBody = experience
      .map(
        (e) =>
          `<article><h3>${esc(e.title ?? "")} <span class="at">\u2014</span> ${esc(e.company ?? "")}</h3><p class="meta">${esc(e.startDate ?? "")}${e.endDate ? ` \u2013 ${esc(e.endDate)}` : " \u2013 present"}</p>${(e.responsibilities ?? []).slice(0, 4).map((r) => `<p>${esc(r)}</p>`).join("")}</article>`
      )
      .join("");

    // \u2500\u2500 Education \u2500\u2500
    const education = profile.education ?? [];
    const eduBody = education
      .map((e) => `<article><h3>${esc(e.institution ?? "")}</h3><p>${esc(e.degree ?? "")}</p>${e.field ? `<p class="meta">${esc(e.field)}</p>` : ""}</article>`)
      .join("");

    // \u2500\u2500 Repos \u2500\u2500
    const repoBody = repos
      .slice(0, maxRepos)
      .map((r) => {
        const url = r.html_url ?? r.url ?? "";
        const name = r.name ?? "unnamed";
        return `<article><h3>${url ? `<a href="${esc(url)}">${esc(name)}</a>` : esc(name)}</h3><p>${esc(r.description ?? "")}</p>${r.language ? `<p class="meta">${esc(r.language)}</p>` : ""}</article>`;
      })
      .join("");

    // \u2500\u2500 Assemble \u2500\u2500
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(id.name ?? "Portfolio")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --font-display: "Inter", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --surface: oklch(0.985 0.005 260);
  --raised: oklch(0.958 0.008 260);
  --border: oklch(0.885 0.012 260);
  --muted: oklch(0.44 0.02 260);
  --text: oklch(0.28 0.025 260);
  --display: oklch(0.20 0.03 260);
  --primary: oklch(0.40 0.11 260);
  --accent: oklch(0.44 0.13 72);
  --accent-soft: oklch(0.92 0.05 78);
  --radius: 2px;
  --dur: 130ms;
  --ease: ease-out;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: oklch(0.17 0.012 260);
    --raised: oklch(0.21 0.015 260);
    --border: oklch(0.30 0.02 260);
    --muted: oklch(0.70 0.02 260);
    --text: oklch(0.82 0.02 260);
    --display: oklch(0.93 0.02 260);
    --primary: oklch(0.66 0.12 260);
    --accent: oklch(0.78 0.13 78);
    --accent-soft: oklch(0.30 0.06 78);
  }
}
* { box-sizing: border-box; margin: 0; }
body {
  font-family: var(--font-body);
  color: var(--text);
  background: var(--surface);
  padding: clamp(1.25rem, 3vw, 2.5rem);
  max-width: 1180px;
  margin-inline: auto;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.75rem; }
h1 {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--display);
}
h1 .dot { color: var(--accent); }
.headline { color: var(--muted); margin: 0.25rem 0 0.5rem; font-size: 0.95rem; }
nav a {
  color: var(--primary);
  margin-right: 1rem;
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 500;
}
nav a:hover { text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 2px; }

h2 {
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
  margin: 2rem 0 0.75rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border);
}
article, .skill-group {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.9rem 1.1rem;
  margin-bottom: 0.7rem;
  transition: background var(--dur) var(--ease);
}
article:hover, .skill-group:hover { background: var(--surface); }
article h3 { font-size: 1rem; font-weight: 600; color: var(--text); }
article h3 .at { color: var(--muted); }
article a { color: var(--primary); text-decoration: none; }
article a:hover { text-decoration: underline; text-decoration-color: var(--accent); }
p.meta { color: var(--muted); font-size: 0.8rem; font-family: var(--font-mono); margin-top: 0.15rem; }
.skill-group h3 { font-size: 0.78rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.4rem; }
.skill-group ul { list-style: none; display: flex; flex-wrap: wrap; gap: 0.35rem; padding: 0; }
.skill-group li {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.15rem 0.6rem;
  font-size: 0.82rem;
  font-family: var(--font-mono);
}
p.placeholder { color: var(--muted); font-style: italic; font-size: 0.85rem; }
footer { margin-top: 3rem; color: var(--muted); font-size: 0.75rem; font-family: var(--font-mono); }

@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
section { animation: rise 260ms cubic-bezier(0.22, 1, 0.36, 1) both; }
section:nth-child(2) { animation-delay: 40ms; }
section:nth-child(3) { animation-delay: 80ms; }
section:nth-child(4) { animation-delay: 120ms; }
section:nth-child(5) { animation-delay: 160ms; }
@media (prefers-reduced-motion: reduce) { section { animation: none; } * { transition: none !important; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>${esc(id.name ?? "Your Name")} <span class="dot">\u00b7</span></h1>
    ${id.headline ? `<p class="headline">${esc(id.headline)}</p>` : ""}
    <nav>${links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("")}</nav>
  </div>
</header>
${sectionWrapper("Skills", skills.length > 0, skillsBody, "No skills recorded yet \u2014 run: bun run profile", populated, placeholders)}
${sectionWrapper("Experience", experience.length > 0, expBody, "No experience recorded yet", populated, placeholders)}
${sectionWrapper("Education", education.length > 0, eduBody, "No education recorded yet", populated, placeholders)}
${sectionWrapper("Open Source & Projects", repos.length > 0, repoBody, "No GitHub data staged \u2014 run: bun run profile:github", populated, placeholders)}
<footer>Generated by ai-job-search portfolio generator \u2014 content sourced only from the candidate profile; empty sections stay honest.</footer>
</body>
</html>`;

    return { html, populated, placeholders };
  },
};
