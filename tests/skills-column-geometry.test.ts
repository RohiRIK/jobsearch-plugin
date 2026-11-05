import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveTypstCommand } from "../src/resolve-bin.js";

const root = resolve(import.meta.dir, "..");
const labels = ["Cloud and identity platforms (production)", "Identity & Access Architecture", "AI & Prompt Engineering", "Infrastructure Automation", "Technical Stack", "Security Orchestration & Response", "Containerization"];
const values = ["VALALPHA", "VALBRAVO", "VALCHARLIE", "VALDELTA", "VALECHO", "VALFOXTROT", "VALGOLF"];
const quote = (s: string) => JSON.stringify(s);

for (const layout of ["technical", "modern"]) {
  test(`${layout}: rendered skill values share a column, wrap labels, and preserve row clearance`, () => {
    const dir = mkdtempSync(join(tmpdir(), "cv-skills-geometry-"));
    try {
      const source = join(dir, "fixture.typ");
      const pdf = join(dir, "fixture.pdf");
      writeFileSync(source, `#import ${quote(join(root, "templates/cv/modern/template.typ"))}: cv-body\n#show: cv-body(name: "Synthetic", lastname: "Candidate", layout: ${quote(layout)}, skills: (${labels.map((label, i) => `(label: ${quote(label)}, value: ${quote(values[i])}),`).join("\n")}))`);
      const command = resolveTypstCommand(root);
      if (!command) throw new Error("Typst is required for PDF geometry regression tests");
      const compiled = Bun.spawnSync([...command, "compile", "--root", "/", source, pdf]);
      expect(compiled.exitCode, compiled.stderr.toString()).toBe(0);
      const extracted = Bun.spawnSync(["pdftotext", "-bbox", pdf, "-"]);
      expect(extracted.exitCode).toBe(0);
      const words = [...extracted.stdout.toString().matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)].map(m => ({x: +m[1], y: +m[2], right: +m[3], bottom: +m[4], text: m[5]}));
      const starts = values.map(value => {
        const found = words.find(w => w.text === value);
        expect(found, `missing ${value}`).toBeDefined();
        return found!;
      });
      expect(Math.max(...starts.map(w => w.x)) - Math.min(...starts.map(w => w.x)), "skill values must share a left edge within 0.5pt").toBeLessThanOrEqual(0.5);
      const labelWords = words.filter(w => w.y >= starts[0].y - 1 && w.x < starts[0].x - 1);
      for (let i = 0; i < starts.length; i++) {
        const rowEnd = i + 1 < starts.length ? starts[i + 1].y - 0.1 : Infinity;
        const rowLabels = labelWords.filter(w => w.y >= starts[i].y - 1 && w.y < rowEnd);
        expect(rowLabels.length).toBeGreaterThan(0);
        expect(Math.max(...rowLabels.map(w => w.right)), "label must not cross value column").toBeLessThan(starts[i].x - 3);
        if (i + 1 < starts.length) {
          const bottom = Math.max(starts[i].bottom, ...rowLabels.map(w => w.bottom));
          expect(starts[i + 1].y - bottom, "wrapped label/value rows need at least 4pt clearance").toBeGreaterThanOrEqual(4);
        }
      }
      expect(new Set(labelWords.filter(w => w.y < starts[1].y - 0.1).map(w => w.y)).size, "long category must wrap inside its own column").toBeGreaterThan(1);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
}
