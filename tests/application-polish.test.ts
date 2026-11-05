import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCanvas } from "@napi-rs/canvas";
import { renderCoverLetterTypst, renderCvTypst } from "../src/application-renderers.js";
import { CODE_ROOT, typstRoot } from "../src/paths.js";
import { applicationProfile, validApplicationDraft } from "./fixtures/application.js";
import { resolveTypstCommand } from "../src/resolve-bin.js";
const typstCommand = () => {
  const command = resolveTypstCommand(CODE_ROOT);
  if (!command) throw new Error("Typst is required for PDF polish regression tests");
  return command;
};

const profile = () => structuredClone(applicationProfile);

test("CV dates are readable without inventing month precision or changing profile data", () => {
  const p = profile();
  p.experience![0].startDate = "2022-11";
  delete p.experience![0].endDate;
  const before = JSON.stringify(p);
  const source = renderCvTypst({profile: p, draft: validApplicationDraft(), outDir: "/nonexistent/output"});
  expect(source).toContain('date: "Nov 2022 – Present"');
  expect(JSON.stringify(p)).toBe(before);
  p.experience![0].startDate = "2020";
  p.experience![0].endDate = "2022-07";
  expect(renderCvTypst({profile: p, draft: validApplicationDraft(), outDir: "/nonexistent/output"})).toContain('date: "2020 – Jul 2022"');
  p.experience![0].startDate = "2022-99";
  p.experience![0].endDate = "Unknown";
  expect(renderCvTypst({profile: p, draft: validApplicationDraft(), outDir: "/nonexistent/output"})).toContain('date: "2022-99 – Unknown"');
});

test("approved portrait compiles with a separate workspace and code root", () => {
  const dir = mkdtempSync(join(tmpdir(), "application-portrait-"));
  try {
    const outDir = join(dir, "applications");
    mkdirSync(outDir);
    const photo = join(dir, "portrait.png");
    const canvas = createCanvas(32, 32);
    const context = canvas.getContext("2d");
    context.fillStyle = "#306080";
    context.fillRect(0, 0, 32, 32);
    writeFileSync(photo, canvas.toBuffer("image/png"));
    const source = join(outDir, "portrait.typ");
    const rendered = renderCvTypst({profile: profile(), draft: validApplicationDraft(), outDir, photo, supportsAvatar: true});
    expect(rendered).not.toContain('photo: ""');
    writeFileSync(source, rendered);
    const run = Bun.spawnSync([...typstCommand(), "compile", "--root", typstRoot(CODE_ROOT, dir), source, join(outDir, "portrait.pdf")]);
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    expect(renderCvTypst({profile: profile(), draft: validApplicationDraft(), outDir, photo, supportsAvatar: false})).toContain('photo: ""');
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("both PDFs preserve profile-owned website and LinkedIn URI annotations", () => {
  const dir = mkdtempSync(join(tmpdir(), "application-links-"));
  try {
    for (const [kind, renderer, template] of [["CV", renderCvTypst, "modern"], ["CL", renderCoverLetterTypst, "modern"], ["CL", renderCoverLetterTypst, "classic"], ["CL", renderCoverLetterTypst, "casual"]] as const) {
      const source = join(dir, `links_${kind}_${template}.typ`);
      const pdf = join(dir, `links_${kind}_${template}.pdf`);
      writeFileSync(source, renderer({profile: profile(), draft: validApplicationDraft(), outDir: dir, template}));
      const compiled = Bun.spawnSync([...typstCommand(), "compile", "--root", typstRoot(CODE_ROOT, dir), source, pdf]);
      expect(compiled.exitCode, compiled.stderr.toString()).toBe(0);
      const urls = Bun.spawnSync(["pdfinfo", "-url", pdf]);
      expect(urls.exitCode).toBe(0);
      expect(urls.stdout.toString()).toContain(applicationProfile.identity.linkedin!);
      expect(urls.stdout.toString()).toContain(applicationProfile.identity.blog!);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("skill display drops redundant production tags without erasing lab restrictions or acronyms", () => {
  const p = profile();
  const d = validApplicationDraft();
  p.skills = [{category: "Containers (production)", skills: ["Docker (production)", "Kubernetes (lab)", "RAG (Retrieval-Augmented Generation)", "Docker Swarm (production use not confirmed)"]}];
  d.cv.skills = p.skills[0].skills.map((text, i) => ({text, evidenceIds: [`profile:skill:0:${i}`]}));
  const before = JSON.stringify(p);
  const source = renderCvTypst({profile: p, draft: d, outDir: "/nonexistent/output"});
  expect(source).toContain('label: "Containers"');
  expect(source).not.toContain("Docker (production),");
  expect(source).toContain("Kubernetes (lab)");
  expect(source).toContain("RAG (Retrieval-Augmented Generation)");
  expect(source).toContain("Docker Swarm (production use not confirmed)");
  expect(JSON.stringify(p)).toBe(before);
});

test("skill polish preserves qualifications that follow a production label", () => {
  const p = profile();
  const d = validApplicationDraft();
  const qualified = ["Docker (production) — lab only", "Okta (production) not confirmed", "GCP (production) (read-only access)"];
  p.skills = [{category: "Scope", skills: qualified}];
  d.cv.skills = qualified.map((text, i) => ({text, evidenceIds: [`profile:skill:0:${i}`]}));
  const source = renderCvTypst({profile: p, draft: d, outDir: "/nonexistent/output"});
  for (const text of qualified) expect(source).toContain(text);
});

test("cover letter date is human-readable, preserving its supplied day", () => {
  const source = renderCoverLetterTypst({profile: profile(), draft: validApplicationDraft(), outDir: "/nonexistent/output", date: "2026-11-05"});
  expect(source).toContain('date: "5 Nov 2026"');
});
