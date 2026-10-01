import { relative, resolve } from "node:path";
import { existsSync } from "node:fs";
import type { Profile } from "./profile-schemas.js";
import { getMarketProfile } from "./market-profiles.js";
import type { ApplicationDraft } from "./application-draft.js";
import { CODE_ROOT } from "./paths.js";


export function typstString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
}

function quoted(value: string): string {
  return `"${typstString(value)}"`;
}

function tuple(values: string[], indent = "    "): string {
  if (values.length === 0) return "()";
  return `(\n${values.map((value) => `${indent}${value},`).join("\n")}\n${indent.slice(0, -2)})`;
}

function importPath(outDir: string, templatePath: string): string {
  const path = relative(outDir, templatePath).replace(/\\/g, "/");
  return path.startsWith(".") ? path : `./${path}`;
}

function candidateNames(profile: Profile): { first: string; last: string; full: string } {
  const identity = profile.identity;
  const explicitFirst = identity.firstName?.trim() ?? "";
  const explicitLast = identity.lastName?.trim() ?? "";
  if (explicitFirst || explicitLast) {
    return { first: explicitFirst, last: explicitLast, full: [explicitFirst, explicitLast].filter(Boolean).join(" ") };
  }
  const parts = (identity.name ?? "Candidate").trim().split(/\s+/);
  return { first: parts.shift() ?? "Candidate", last: parts.join(" "), full: identity.name?.trim() || "Candidate" };
}

export function renderCvTypst(input: {
  profile: Profile;
  draft: ApplicationDraft;
  outDir: string;
  template?: string;
  /** Market code, e.g. "de". Decides section order; omitted means experience first. */
  market?: string;
  /** Optional local photo path. Only passed when the market profile expects one. */
  photo?: string;
  /** Layout variant; the modern template implements the portable variant family. */
  layout?: string;
  /** Whether this template has a designed avatar/photo slot. */
  supportsAvatar?: boolean;
}): string {
  const { profile, draft, outDir } = input;
  const template = input.template ?? "modern";
  const names = candidateNames(profile);
  const identity = profile.identity;
  const templateImport = importPath(outDir, `${CODE_ROOT}/templates/cv/${template}/template.typ`);
  // Keep visible contact labels short while preserving each literal URL as the
  // clickable PDF destination. Raw URLs in the header are a common overflow source.
  const contact = [
    identity.email && quoted(identity.email),
    identity.phone && quoted(identity.phone),
    identity.location && quoted(identity.location),
    identity.linkedin && `link(${quoted(identity.linkedin)})[LinkedIn]`,
    identity.blog && `link(${quoted(identity.blog)})[Website]`,
  ].filter((value): value is string => Boolean(value));
  const languages = identity.languages ?? [];
  const skillGroups = new Map<string, string[]>();
  for (const skill of draft.cv.skills) {
    const evidenceId = skill.evidenceIds[0] ?? "";
    const match = /^profile:skill:(\d+):\d+$/.exec(evidenceId);
    const category = match ? profile.skills?.[Number(match[1])]?.category ?? "Skills" : "Skills";
    skillGroups.set(category, [...(skillGroups.get(category) ?? []), skill.text]);
  }
  const skills = [...skillGroups].map(([category, values]) =>
    `(label: ${quoted(category)}, value: ${quoted(values.join(", "))})`
  );
  const experience = draft.cv.experience.map((entry) => {
    const source = profile.experience?.[entry.sourceIndex];
    if (!source) throw new Error(`No experience at sourceIndex ${entry.sourceIndex}`);
    const date = [source.startDate, source.endDate ?? "Present"].filter(Boolean).join(" - ");
    return `(date: ${quoted(date)}, title: ${quoted(source.title)}, company: ${quoted(source.company)}, location: ${quoted(source.location ?? "")}, content: ${tuple(entry.bullets.map((bullet) => quoted(bullet.text)), "      ")})`;
  });
  // Portfolio projects, resolved by slug so the name and link stay owned by
  // data/profile.json. The draft supplies only the evidence-backed prose.
  const projects = draft.cv.projects.map((entry) => {
    const source = profile.projects?.find((item) => item.slug === entry.slug);
    if (!source) throw new Error(`No portfolio project with slug ${entry.slug}`);
    const highlights = tuple(entry.highlights.map((item) => quoted(item.text)), "      ");
    return `(title: ${quoted(source.name)}, url: ${quoted(source.link ?? "")}, description: ${quoted(entry.description.text)}, highlights: ${highlights})`;
  });
  // Section order is a market convention (src/market-profiles.ts), not a style
  // choice. German-speaking markets expect education before work experience.
  const educationFirst = input.market ? getMarketProfile(input.market)?.ordering === "education-first" : false;
  const education = (profile.education ?? []).map((item) => {
    const year = [item.startYear, item.endYear].filter(Boolean).join(" - ");
    return `(year: ${quoted(year)}, degree: ${quoted(item.degree)}, institution: ${quoted(item.institution)}, field: ${quoted(item.field)})`;
  });
  const certifications = (profile.certifications ?? []).map(
    (item) => `(name: ${quoted(item.name)}, date: ${quoted(item.date ?? "")})`,
  );
  // The headline is a subtitle under the name; the profile block carries the
  // summary only. Concatenating both duplicated the same claim in the fixture
  // CV and read like an article introduction rather than a CV.
  const profileText = draft.cv.summary.text;
  const photo = input.supportsAvatar && input.photo && existsSync(input.photo) ? input.photo : "";

  return `// Evidence-grounded application draft. Validate with: bun run application review
#import "${typstString(templateImport)}": cv-body

#show: cv-body(
  name: ${quoted(names.first)},
  lastname: ${quoted(names.last)},
  contact: ${tuple(contact)},
  languages: ${tuple(languages.map(quoted))},
  headline: ${quoted(draft.cv.headline.text.replace(/[.!?]+$/, ""))},
  photo: ${quoted(photo)},
  profile: ${quoted(profileText)},
  skills: ${tuple(skills)},
  experience: ${tuple(experience)},
  projects: ${tuple(projects)},
  education: ${tuple(education)},
  certifications: ${tuple(certifications)},
  education-first: ${educationFirst},
  is-rtl: false,
  layout: ${quoted(input.layout ?? "modern")},
)
`;
}

export function renderCoverLetterTypst(input: {
  profile: Profile;
  draft: ApplicationDraft;
  outDir: string;
  template?: string;
  date?: string;
}): string {
  const { profile, draft, outDir } = input;
  const template = input.template ?? "modern";
  const identity = profile.identity;
  const names = candidateNames(profile);
  const templateImport = importPath(outDir, `${CODE_ROOT}/templates/cover/${template}/template.typ`);
  const paragraphs = draft.coverLetter.paragraphs.map((paragraph) => quoted(paragraph.text));

  return `// Evidence-grounded application draft. Validate with: bun run application review
#import "${typstString(templateImport)}": cover-letter

#show: cover-letter(
  name: ${quoted(names.full)},
  email: ${quoted(identity.email ?? "")},
  phone: ${quoted(identity.phone ?? "")},
  linkedin: ${quoted(identity.linkedin ?? "")},
  date: ${quoted(input.date ?? new Date().toISOString().slice(0, 10))},
  recipient: ${quoted(draft.coverLetter.recipient)},
  company: ${quoted(draft.company)},
  role: ${quoted(draft.role)},
  paragraphs: ${tuple(paragraphs)},
  bullets: (),
  closing: ${quoted(draft.coverLetter.closing)},
)
`;
}
