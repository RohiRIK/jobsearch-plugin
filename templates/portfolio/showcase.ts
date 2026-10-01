import type { PortfolioTemplate, PortfolioData } from "../../src/portfolio-templates.js";
import { esc, buildLinks, sectionWrapper } from "../../src/portfolio-templates.js";

function projectCard(project: NonNullable<PortfolioData["profile"]["projects"]>[number]): string {
  const domains = (project.domains ?? []).map((domain) => `<span class="tag">${esc(domain)}</span>`).join("");
  const stack = (project.stack ?? []).map((item) => `<span class="stack">${esc(item)}</span>`).join("");
  const title = project.link
    ? `<a href="${esc(project.link)}">${esc(project.name)}</a>`
    : esc(project.name);
  return `<article class="project">
    ${project.image ? `<img class="project-image" src="${esc(project.image)}" alt="${esc(project.name)} project image" loading="lazy">` : ""}
    <div class="project-head"><h3>${title}</h3><span class="badge">${project.kind === "work" ? "Client work" : "Personal"}</span></div>
    <p>${esc(project.summary)}</p>
    ${project.impact ? `<p class="impact"><strong>Outcome:</strong> ${esc(project.impact)}</p>` : ""}
    ${domains ? `<div class="tags">${domains}</div>` : ""}
    ${stack ? `<div class="stack-row">${stack}</div>` : ""}
    ${project.link ? `<p class="project-link"><a href="${esc(project.link)}">Read the project write-up →</a></p>` : ""}
  </article>`;
}

function projectSection(
  title: string,
  projects: NonNullable<PortfolioData["profile"]["projects"]>,
  kind: "work" | "personal",
  populated: string[],
  placeholders: string[],
): string {
  const visible = projects.filter((project) => project.kind === kind && project.disclosure !== "restricted" && project.disclosure !== "unreviewed");
  return sectionWrapper(
    title,
    visible.length > 0,
    visible.map(projectCard).join(""),
    "No approved projects in this category yet. Review project disclosure before publishing.",
    populated,
    placeholders,
  );
}

export const showcaseTemplate: PortfolioTemplate = {
  name: "showcase",
  description: "Project warehouse: approved work and personal projects with outcomes, domains, and stack",

  render(data: PortfolioData): { html: string; populated: string[]; placeholders: string[] } {
    const { profile, repos, maxRepos } = data;
    const id = profile.identity ?? {};
    const populated: string[] = [];
    const placeholders: string[] = [];
    const projects = profile.projects ?? [];
    const links = buildLinks(id);
    const skills = profile.skills ?? [];
    const experience = profile.experience ?? [];

    const skillsBody = skills
      .map((category) => `<div class="skill-group"><h3>${esc(category.category)}</h3><p>${category.skills.map((skill) => esc(skill)).join(" · ")}</p></div>`)
      .join("");
    const experienceBody = experience
      .map((entry) => `<article><h3>${esc(entry.title)} · ${esc(entry.company)}</h3><p class="meta">${esc(entry.startDate ?? "")}${entry.endDate ? ` – ${esc(entry.endDate)}` : " – present"}</p>${(entry.responsibilities ?? []).slice(0, 3).map((item) => `<p>${esc(item)}</p>`).join("")}</article>`)
      .join("");
    const repoBody = repos
      .slice(0, maxRepos)
      .map((repo) => {
        const url = repo.html_url ?? repo.url ?? "";
        const name = repo.name ?? "unnamed";
        return `<article><h3>${url ? `<a href="${esc(url)}">${esc(name)}</a>` : esc(name)}</h3><p>${esc(repo.description ?? "")}</p>${repo.language ? `<p class="meta">${esc(repo.language)}</p>` : ""}</article>`;
      })
      .join("");

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(id.name ?? "Project Showcase")}</title>
<style>
:root { --bg:#f7f8fa; --card:#fff; --ink:#15202b; --muted:#5c6b7a; --line:#dfe5ec; --accent:#1a5276; --accent-soft:#eaf2f8; --work:#1d6b52; --personal:#6b4ea0; }
@media (prefers-color-scheme: dark) { :root { --bg:#10151b; --card:#171e26; --ink:#e8eef4; --muted:#9fb0c0; --line:#2b3642; --accent:#6db3e2; --accent-soft:#1d2b38; --work:#63c9a5; --personal:#c0a4f0; } }
* { box-sizing:border-box; margin:0; }
body { background:var(--bg); color:var(--ink); font:16px/1.6 Inter,system-ui,-apple-system,sans-serif; }
.wrap { max-width:1100px; margin:auto; padding:clamp(1.5rem,5vw,4rem) 1.25rem 5rem; }
header { display:flex; justify-content:space-between; gap:2rem; align-items:flex-end; border-bottom:2px solid var(--accent); padding-bottom:1.5rem; margin-bottom:1rem; }
.identity { display:flex; align-items:center; gap:1rem; } .avatar { width:64px; height:64px; border-radius:50%; object-fit:cover; border:2px solid var(--accent); }
h1 { font-size:clamp(2rem,5vw,3.5rem); letter-spacing:-.04em; line-height:1.05; }
.headline { color:var(--muted); margin-top:.6rem; font-size:1.05rem; }
nav { display:flex; gap:1rem; flex-wrap:wrap; } nav a { color:var(--accent); text-decoration:none; font-weight:600; } nav a:hover { text-decoration:underline; }
h2 { font-size:.8rem; text-transform:uppercase; letter-spacing:.14em; color:var(--muted); margin:3rem 0 1rem; }
.project-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:1rem; }
.project, article, .skill-group { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:1.1rem 1.2rem; }
.project-head { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; }
.project-image { display:block; width:100%; max-height:220px; object-fit:cover; border-radius:7px; margin-bottom:1rem; border:1px solid var(--line); }
h3 { font-size:1.05rem; line-height:1.3; } a { color:var(--accent); text-decoration:none; } a:hover { text-decoration:underline; }
.badge { white-space:nowrap; font-size:.68rem; text-transform:uppercase; letter-spacing:.08em; border-radius:999px; padding:.2rem .5rem; }
.project:has(.badge) .badge { color:var(--work); background:color-mix(in srgb, var(--work) 14%, transparent); }
.project:nth-child(even) .badge { color:var(--personal); background:color-mix(in srgb, var(--personal) 14%, transparent); }
.project p { margin-top:.55rem; color:var(--muted); } .impact { color:var(--ink); }
.tags, .stack-row { display:flex; gap:.4rem; flex-wrap:wrap; margin-top:.8rem; }
.tag, .stack { font-size:.72rem; border-radius:5px; padding:.18rem .45rem; } .tag { color:var(--accent); background:var(--accent-soft); } .stack { color:var(--muted); border:1px solid var(--line); }
.project-link { font-size:.85rem; } .meta { color:var(--muted); font-size:.8rem; margin-top:.2rem; }
.skill-group { margin-bottom:.7rem; } .skill-group h3 { font-size:.8rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); } .skill-group p { color:var(--muted); }
.placeholder { color:var(--muted); font-style:italic; }
footer { margin-top:4rem; padding-top:1rem; border-top:1px solid var(--line); color:var(--muted); font-size:.8rem; }
@media (max-width:640px) { header { display:block; } nav { margin-top:1rem; } }
</style>
</head>
<body><main class="wrap">
<header><div class="identity">${id.avatar ? `<img class="avatar" src="${esc(id.avatar)}" alt="${esc(id.name ?? "Profile")} avatar">` : ""}<div><h1>${esc(id.name ?? "Project Showcase")}</h1>${id.headline ? `<p class="headline">${esc(id.headline)}</p>` : ""}</div></div><nav>${links.map((link) => `<a href="${esc(link.href)}">${esc(link.label)}</a>`).join("")}</nav></header>
${projectSection("Client work", projects, "work", populated, placeholders)}
${projectSection("Personal projects", projects, "personal", populated, placeholders)}
${sectionWrapper("Skills", skills.length > 0, skillsBody, "No skills recorded yet", populated, placeholders)}
${sectionWrapper("Experience", experience.length > 0, experienceBody, "No experience recorded yet", populated, placeholders)}
${sectionWrapper("Open source", repos.length > 0, repoBody, "No GitHub data staged", populated, placeholders)}
<footer>Generated from the approved candidate profile. Unreviewed and restricted projects never appear here.</footer>
</main></body></html>`;

    return { html, populated, placeholders };
  },
};
