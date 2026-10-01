import type { PortfolioTemplate, PortfolioData } from "../../src/portfolio-templates.js";
import { esc, buildLinks, sectionWrapper } from "../../src/portfolio-templates.js";

export const terminalTemplate: PortfolioTemplate = {
  name: "terminal",
  description: "Monospace green-on-black retro CLI, blinking cursor, box-drawing sections, dark-only",

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
          `  <div class="skill-group">\n    <span class="prompt">#</span> <span class="cat">${esc(c.category)}</span>\n    <p>${c.skills.map((s) => `<span class="tag">${esc(s)}</span>`).join(" ")}</p>\n  </div>`
      )
      .join("\n");

    const experience = profile.experience ?? [];
    const expBody = experience
      .map(
        (e) =>
          `  <article>\n    <span class="line"><span class="prompt">$</span> <b>${esc(e.title ?? "")}</b> @ ${esc(e.company ?? "")}</span>\n    <span class="meta">${esc(e.startDate ?? "")}${e.endDate ? ` - ${esc(e.endDate)}` : " - present"}</span>\n${(e.responsibilities ?? []).slice(0, 4).map((r) => `    <span class="bullet">  * ${esc(r)}</span>`).join("\n")}\n  </article>`
      )
      .join("\n");

    const education = profile.education ?? [];
    const eduBody = education
      .map((e) => `  <article>\n    <span class="prompt">$</span> <b>${esc(e.institution ?? "")}</b>\n    <span class="meta">${esc(e.degree ?? "")}</span>\n  </article>`)
      .join("\n");

    const repoBody = repos
      .slice(0, maxRepos)
      .map((r) => {
        const url = r.html_url ?? r.url ?? "";
        const name = r.name ?? "unnamed";
        return `  <article>\n    <span class="prompt">$</span> ${url ? `<a href="${esc(url)}">${esc(name)}</a>` : `<b>${esc(name)}</b>`}\n    <span class="desc">${esc(r.description ?? "")}</span>\n    ${r.language ? `<span class="meta">[${esc(r.language)}]</span>` : ""}\n  </article>`;
      })
      .join("\n");

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(id.name ?? "Portfolio")}</title>
<style>
:root {
  --bg: #0a0a0a;
  --green: #00ff41;
  --dim: #008f11;
  --muted: #4a6a4a;
  --border: #1a3a1a;
  --amber: #ffb000;
  --link: #00d4ff;
}
* { box-sizing: border-box; margin: 0; }
body {
  font: 14px/1.6 "JetBrains Mono", "SF Mono", "Fira Code", ui-monospace, monospace;
  color: var(--green);
  background: var(--bg);
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  text-shadow: 0 0 2px rgba(0,255,65,0.3);
}
header { margin-bottom: 2rem; }
h1 { font-size: 1.5rem; font-weight: 600; }
h1 .cursor { animation: blink 1s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
.headline { color: var(--dim); margin: 0.3rem 0 0.5rem; font-size: 0.92rem; }
nav a { color: var(--link); margin-right: 1.5rem; text-decoration: none; }
nav a:hover { text-decoration: underline; }

section { margin-top: 1.75rem; }
h2 {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--amber);
  border-bottom: 1px dashed var(--border);
  padding-bottom: 0.3rem;
  margin-bottom: 0.8rem;
}
h2::before { content: "\u2514\u2500\u2500 "; color: var(--dim); }

article { margin-bottom: 0.7rem; padding-left: 1rem; }
article a { color: var(--link); text-decoration: none; }
article a:hover { text-decoration: underline; }
article b { color: var(--green); font-weight: 600; }

.prompt { color: var(--dim); }
.cat { color: var(--amber); font-weight: 600; }
.meta { display: block; color: var(--muted); font-size: 0.82rem; margin-top: 0.15rem; }
.desc { display: block; color: var(--dim); font-size: 0.88rem; margin-top: 0.15rem; }
.bullet { display: block; color: var(--dim); font-size: 0.88rem; }

.skill-group { margin-bottom: 0.6rem; }
.tag {
  display: inline-block;
  color: var(--green);
  border: 1px solid var(--border);
  padding: 0.05rem 0.4rem;
  margin: 0.1rem;
  font-size: 0.8rem;
}

p.placeholder { color: var(--muted); font-style: italic; font-size: 0.85rem; }
footer { margin-top: 3rem; color: var(--muted); font-size: 0.72rem; }
footer::before { content: "// "; color: var(--dim); }

@media (prefers-reduced-motion: reduce) { h1 .cursor { animation: none; } }
</style>
</head>
<body>
<header>
  <h1>${esc(id.name ?? "your_name")}<span class="cursor">_</span></h1>
  ${id.headline ? `<p class="headline">${esc(id.headline)}</p>` : ""}
  <nav>${links.map((l) => `<a href="${esc(l.href)}">[${esc(l.label)}]</a>`).join("")}</nav>
</header>
${sectionWrapper("Skills", skills.length > 0, skillsBody, "No skills recorded yet \u2014 run: bun run profile", populated, placeholders)}
${sectionWrapper("Experience", experience.length > 0, expBody, "No experience recorded yet", populated, placeholders)}
${sectionWrapper("Education", education.length > 0, eduBody, "No education recorded yet", populated, placeholders)}
${sectionWrapper("Projects", repos.length > 0, repoBody, "No GitHub data staged \u2014 run: bun run profile:github", populated, placeholders)}
<footer>generated by ai-job-search portfolio generator \u2014 content sourced only from the candidate profile</footer>
</body>
</html>`;

    return { html, populated, placeholders };
  },
};
