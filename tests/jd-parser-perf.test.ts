import { describe, expect, test } from "bun:test";
import { SKILL_TERMS, summarizeText } from "../scripts/jobs/summarize.js";

// Posting text is untrusted (scraped boards, pasted ads). These bounds guard
// against the parser going quadratic again on a crafted ad; real postings
// parse in a few ms. Bounds are generous so slow CI runners do not flake.
function timed(text: string): { ms: number; result: ReturnType<typeof summarizeText> } {
  const start = performance.now();
  const result = summarizeText(text);
  return { ms: performance.now() - start, result };
}

describe("JD parser performance on hostile input", () => {
  test('200 KB of "ai " (the MCP posting_text cap) parses in under 500 ms', () => {
    const { ms, result } = timed("ai ".repeat(66_666));
    expect(result.requiredSkills).toContain("ai");
    expect(ms).toBeLessThan(500);
  });

  test('510 KB of "ai\\n" (under the triage 512 KB cap) parses in under 5 s', () => {
    const { ms, result } = timed("ai\n".repeat(170_000));
    expect(result.requiredSkills).toContain("ai");
    expect(ms).toBeLessThan(5_000);
  });

  test("a dense 200 KB skills list parses in under 2 s", () => {
    let text = "Senior Engineer\nRequirements:\n";
    const line = `- ${SKILL_TERMS.join(", ")}\n`;
    while (text.length < 200_000) text += line;
    const { ms, result } = timed(text.slice(0, 200_000));
    expect(result.requirements.length).toBeGreaterThan(50);
    expect(ms).toBeLessThan(2_000);
  });
});
