import { Profile } from "./profile-schemas.js";

// ── Shared types ─────────────────────────────────────

export interface Repo {
  name?: string;
  description?: string;
  url?: string;
  html_url?: string;
  language?: string;
  stars?: number;
  stargazers_count?: number;
}

export interface PortfolioData {
  profile: Profile;
  repos: Repo[];
  maxRepos: number;
}

export interface PortfolioTemplate {
  name: string;
  description: string;
  render(data: PortfolioData): { html: string; populated: string[]; placeholders: string[] };
}

// ── Helpers ─────────────────────────────────────

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function buildLinks(id: Profile["identity"]): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  if (id.github) links.push({ label: "GitHub", href: id.github });
  if (id.linkedin) links.push({ label: "LinkedIn", href: id.linkedin });
  if (id.blog) links.push({ label: "Blog", href: id.blog });
  if (id.email) links.push({ label: "Email", href: `mailto:${id.email}` });
  return links;
}

export function sectionWrapper(
  name: string,
  hasData: boolean,
  body: string,
  placeholder: string,
  populated: string[],
  placeholders: string[]
): string {
  (hasData ? populated : placeholders).push(name);
  return `<section><h2>${esc(name)}</h2>${hasData ? body : `<p class="placeholder">${esc(placeholder)}</p>`}</section>`;
}

// ── Template registry ────────────────────────────────

import { modernTemplate } from "../templates/portfolio/modern.js";
import { minimalTemplate } from "../templates/portfolio/minimal.js";
import { terminalTemplate } from "../templates/portfolio/terminal.js";
import { showcaseTemplate } from "../templates/portfolio/showcase.js";

export const TEMPLATES: Record<string, PortfolioTemplate> = {
  modern: modernTemplate,
  minimal: minimalTemplate,
  terminal: terminalTemplate,
  showcase: showcaseTemplate,
};

export const DEFAULT_TEMPLATE = "showcase";

export function getTemplate(name: string): PortfolioTemplate {
  return TEMPLATES[name] ?? TEMPLATES[DEFAULT_TEMPLATE];
}

export function listTemplates(): { name: string; description: string }[] {
  return Object.values(TEMPLATES).map((t) => ({ name: t.name, description: t.description }));
}
