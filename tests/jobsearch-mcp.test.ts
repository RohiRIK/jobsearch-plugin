import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Tracker } from "../src/tracker.js";
import { mcpPartition } from "../src/jobsearch/mcp.js";
import { COMMANDS } from "../src/jobsearch/registry.js";
import { applicationPosting, applicationProfile } from "./fixtures/application.js";

const ROOT = resolve(import.meta.dir, "..");
let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "jobsearch-mcp-"));
  mkdirSync(join(dir, "data"), { recursive: true });
  writeFileSync(join(dir, "data", "profile.json"), JSON.stringify(applicationProfile));
  const tracker = new Tracker(join(dir, "data", "tracker.db"));
  tracker.insert({ id: "app_20260901_example-labs", date: "2026-09-01", company: "Example Labs", role: "Platform Engineer", status: "applied" });
  tracker.close();
  client = new Client({ name: "jobsearch-mcp-test", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(ROOT, "scripts/jobsearch.ts"), "mcp"],
      env: { ...(process.env as Record<string, string>), JOB_SEARCH_HOME: dir, TRACKER_DB: "" },
      stderr: "ignore",
    }),
  );
}, 20000);

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

const body = (result: Awaited<ReturnType<Client["callTool"]>>) => JSON.parse((result.content as Array<{ text: string }>)[0].text);

describe("generated MCP surface", () => {
  test("is coarse: at most 7 tools and 5 KB of schema", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeLessThanOrEqual(7);
    expect(JSON.stringify(tools).length).toBeLessThanOrEqual(5000);
  });

  test("every non-CLI command is reachable through exactly one tool", () => {
    const { named, reads, writes } = mcpPartition();
    const reachable = [...named.map(([n]) => n), ...reads, ...writes].sort();
    const expected = Object.entries(COMMANDS).filter(([, s]) => !s.cliOnly).map(([n]) => n).sort();
    expect(reachable).toEqual(expected);
  });

  test("named tools accept posting_text when the host has no file access", async () => {
    const out = body(await client.callTool({ name: "jobsearch_triage", arguments: { posting_text: applicationPosting } }));
    expect(out.ok).toBe(true);
    expect(out.data.fit.matched).toEqual(expect.arrayContaining(["python"]));
  });

  test("jobsearch_run serves help and read-only commands", async () => {
    const help = body(await client.callTool({ name: "jobsearch_run", arguments: { command: "help" } }));
    expect(help.data.commands).toHaveProperty("tracker-add");
    const list = body(await client.callTool({ name: "jobsearch_run", arguments: { command: "tracker-list", args: { limit: "5" } } }));
    expect(list.data.total).toBe(1);
  });

  test("unknown arguments are rejected, not ignored", async () => {
    const out = body(await client.callTool({ name: "jobsearch_run", arguments: { command: "tracker-list", args: { colour: "red" } } }));
    expect(out.ok).toBe(false);
    expect(out.error.type).toBe("usage");
  });

  test("jobsearch_write requires confirm: true", async () => {
    const result = await client.callTool({ name: "jobsearch_write", arguments: { command: "tracker-status", args: { id: "app_20260901_example-labs", status: "rejected" } } });
    expect(result.isError).toBe(true);
  });

  test("jobsearch_write dry_run previews with exit 10 and writes nothing", async () => {
    const preview = body(await client.callTool({ name: "jobsearch_write", arguments: { command: "tracker-status", args: { id: "app_20260901_example-labs", status: "interviewing" }, confirm: true, dry_run: true } }));
    expect(preview.exit).toBe(10);
    const list = body(await client.callTool({ name: "jobsearch_run", arguments: { command: "tracker-list" } }));
    expect(list.data.applications[0].status).toBe("applied");
  });

  test("jobsearch_write applies a confirmed write", async () => {
    const done = body(await client.callTool({ name: "jobsearch_write", arguments: { command: "tracker-status", args: { id: "app_20260901_example-labs", status: "interviewing" }, confirm: true } }));
    expect(done.ok).toBe(true);
    expect(done.data.changed).toBe(true);
  });

  test("the tailor_application prompt is still offered", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("tailor_application");
  });
});
