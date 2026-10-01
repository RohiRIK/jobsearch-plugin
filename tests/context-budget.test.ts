import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { mcpPartition } from "../src/jobsearch/mcp.js";
import { applicationPosting, applicationProfile } from "./fixtures/application.js";

/**
 * Efficiency is a gate, not a goal. Every model-visible description and every
 * named MCP tool is paid for in context on every turn of every session, so
 * these ceilings fail the build when the plugin quietly grows. Raise a ceiling
 * only on purpose, with the reason in the commit message.
 *
 * Measured 2026-10-01 with `claude plugin details` (always-on tokens):
 *   before: 19 skills/commands ~1,791 tok; .agents/skills 14 entries ~2,789 tok
 *   after:  16 entries ~1,220 tok (incl. manage + skill factory); router ~106 tok
 */
const ROOT = resolve(import.meta.dir, "..");
const PLUGIN = join(ROOT, "job-search");

const BUDGET = {
  pluginEntries: 16, // skills + commands + agents Claude Code lists
  pluginDescriptionBytes: 3500,
  agentsDirEntries: 1, // hosts that read .agents/skills see only the router
  namedMcpTools: 5,
  triageBytes: 2000,
};

function description(path: string): string {
  const fm = readFileSync(path, "utf-8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return fm.match(/^description:\s*(.+)$/m)?.[1] ?? "";
}

const entries = [
  ...readdirSync(join(PLUGIN, "skills")).filter((d) => existsSync(join(PLUGIN, "skills", d, "SKILL.md"))).map((d) => join(PLUGIN, "skills", d, "SKILL.md")),
  ...readdirSync(join(PLUGIN, "commands")).map((f) => join(PLUGIN, "commands", f)),
  ...readdirSync(join(PLUGIN, "agents")).map((f) => join(PLUGIN, "agents", f)),
];

describe("context budget", () => {
  test(`plugin lists at most ${BUDGET.pluginEntries} skills/commands/agents`, () => {
    expect(entries.length).toBeLessThanOrEqual(BUDGET.pluginEntries);
  });

  test(`their descriptions total at most ${BUDGET.pluginDescriptionBytes} bytes`, () => {
    const bytes = entries.reduce((sum, p) => sum + description(p).length, 0);
    expect(bytes).toBeLessThanOrEqual(BUDGET.pluginDescriptionBytes);
  });

  test("hosts reading .agents/skills see only the router; .claude/skills is gone", () => {
    const visible = readdirSync(join(ROOT, ".agents", "skills")).filter((d) => existsSync(join(ROOT, ".agents", "skills", d, "SKILL.md")));
    expect(visible.length).toBeLessThanOrEqual(BUDGET.agentsDirEntries);
    expect(existsSync(join(ROOT, ".claude", "skills"))).toBe(false);
  });

  test(`at most ${BUDGET.namedMcpTools} named MCP tools (plus jobsearch_run and jobsearch_write)`, () => {
    expect(mcpPartition().named.length).toBeLessThanOrEqual(BUDGET.namedMcpTools);
  });

  test(`a triage result stays under ${BUDGET.triageBytes} bytes`, async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const home = mkdtempSync(join(tmpdir(), "budget-"));
    try {
      mkdirSync(join(home, "data"));
      writeFileSync(join(home, "data", "profile.json"), JSON.stringify(applicationProfile));
      writeFileSync(join(home, "posting.txt"), applicationPosting);
      const proc = Bun.spawnSync([process.execPath, join(ROOT, "scripts/jobsearch.ts"), "triage", "--job", join(home, "posting.txt")], {
        env: { ...process.env, JOB_SEARCH_HOME: home, JOB_SEARCH_TELEMETRY: "0" },
      });
      expect(proc.exitCode).toBe(0);
      expect(proc.stdout.length).toBeLessThanOrEqual(BUDGET.triageBytes);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
