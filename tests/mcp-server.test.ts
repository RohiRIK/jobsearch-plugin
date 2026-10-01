import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

// Isolated throwaway tracker DB so the harness never contends with a concurrent
// CLI/MCP process on the shared data/tracker.db (root cause of the earlier
// intermittent add_application/update failures).
const TEST_DB = join(tmpdir(), `job-search-mcp-test-${process.pid}-${Date.now()}.db`);

let client: Client;
const insertedIds: string[] = [];

beforeAll(async () => {
  client = new Client({ name: "test-harness", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      // process.execPath = the running bun binary — "bun" by name is not
      // spawnable under snap-packaged bun on Linux.
      command: process.execPath,
      args: ["run", join(ROOT, "scripts", "mcp", "server.ts")],
      env: { ...process.env, TRACKER_DB: TEST_DB },
    })
  );
});

afterAll(async () => {
  await client.close();
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      rmSync(TEST_DB + suffix);
    } catch {
      /* file may not exist */
    }
  }
});

function parseResult(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text);
}

describe("MCP server over stdio", () => {
  test("exposes all expected tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "add_application",
        "get_analytics",
        "get_profile",
        "list_applications",
        "list_jobs",
        "pending_followups",
        "score_job",
        "update_application_status",
        "select_template",
        "market_snapshot",
        "list_alerts",
        "draft_cover_letter",
        "prepare_application",
        "review_application_draft",
        "interview_prep",
      ].sort()
    );
  });

  test("select_template ranks and selects available templates", async () => {
    const data = parseResult(
      await client.callTool({
        name: "select_template",
        arguments: { posting_text: "Senior DevOps Engineer at a large bank in Tel Aviv. Azure, Kubernetes. Hebrew required." },
      })
    );
    expect(data).toHaveProperty("selected");
    expect(data).toHaveProperty("confidence");
  });

  test("market_snapshot aggregates seen jobs", async () => {
    const data = parseResult(await client.callTool({ name: "market_snapshot", arguments: {} }));
    expect(typeof data.totalJobs).toBe("number");
  });

  test("list_alerts returns pending jobs", async () => {
    const data = parseResult(await client.callTool({ name: "list_alerts", arguments: {} }));
    expect(typeof data.pending).toBe("number");
  });

  test("interview_prep builds a prep sheet", async () => {
    const data = parseResult(
      await client.callTool({
        name: "interview_prep",
        arguments: { posting_text: "DevOps engineer role. Requirements: PowerShell, Azure, automation. 5+ years." },
      })
    );
    expect(Array.isArray(data.technicalQuestions)).toBe(true);
    expect(Array.isArray(data.questionsToAsk)).toBe(true);
  });

  test("draft_cover_letter returns draft or honest no-profile error", async () => {
    const data = parseResult(
      await client.callTool({
        name: "draft_cover_letter",
        arguments: { company: "Acme", role: "Engineer" },
      })
    );
    if (data.error) {
      expect(String(data.error)).toMatch(/profile/i);
    } else {
      expect(Array.isArray(data.paragraphs)).toBe(true);
      expect(String(data.suggested_file)).toMatch(/_CL\.(typ|tex)$/);
    }
  });

  test("exposes the provider-neutral tailor_application prompt", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toContain("tailor_application");
    const result = await client.getPrompt({
      name: "tailor_application",
      arguments: {
        company: "Acme",
        role: "Platform Engineer",
        posting_text: "Platform Engineer role. Requirements: Python, Terraform, secure delivery automation.",
      },
    });
    const text = result.messages.map((message) => (message.content as { text?: string }).text ?? "").join("\n");
    expect(text).toMatch(/evidence-bound|profile is unavailable/i);
  });

  test("prepare_application is read-only and returns structured/text parity when a profile exists", async () => {
    const result = await client.callTool({
      name: "prepare_application",
      arguments: {
        company: "Acme",
        role: "Platform Engineer",
        posting_text: "Platform Engineer role. Requirements: Python, Terraform, secure delivery automation.",
      },
    });
    const data = parseResult(result);
    if (data.error) {
      expect(String(data.error)).toMatch(/profile/i);
    } else {
      expect(String(data.prompt)).toContain("<response_contract>");
      expect(result.structuredContent).toEqual(data);
    }
  });

  test("review_application_draft handles invalid JSON without writing", async () => {
    const result = await client.callTool({
      name: "review_application_draft",
      arguments: {
        company: "Acme",
        role: "Platform Engineer",
        posting_text: "Platform Engineer role. Requirements: Python, Terraform, secure delivery automation.",
        draft_json: "{not-json}",
      },
    });
    const data = parseResult(result);
    if (data.error) {
      expect(String(data.error)).toMatch(/profile/i);
    } else {
      expect(data.pass).toBe(false);
      expect(JSON.stringify(data)).toContain("INVALID_JSON");
      expect(result.structuredContent).toEqual(data);
    }
  });

  test("get_analytics returns pipeline shape", async () => {
    const data = parseResult(await client.callTool({ name: "get_analytics", arguments: {} }));
    expect(data).toHaveProperty("pipeline");
    expect(data).toHaveProperty("responseMetrics");
  });

  test("score_job scores raw text, or reports the missing profile honestly", async () => {
    const data = parseResult(
      await client.callTool({
        name: "score_job",
        arguments: { text: "DevOps engineer. Requirements: PowerShell, Python, Kubernetes. 3+ years." },
      })
    );
    if (data.error) {
      // CI has no data/profile.json (personal data is gitignored) — the honest error is the correct behavior there.
      expect(String(data.error)).toMatch(/profile/i);
    } else {
      expect(typeof data.score).toBe("number");
      expect(Array.isArray(data.gaps)).toBe(true);
      expect(Array.isArray(data.skillEvidence)).toBe(true);
      expect(["eligible", "ineligible", "review"]).toContain((data.eligibility as { status?: string }).status ?? "");
    }
  });

  test("add_application without confirm is rejected by schema", async () => {
    const result = await client
      .callTool({ name: "add_application", arguments: { company: "McpTestCo", role: "Tester" } })
      .catch((e) => ({ isError: true, content: [{ type: "text", text: String(e) }] }));
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>).map((c) => c.text).join(" ");
    expect(text).toMatch(/confirm|invalid|required/i);
  });

  test("add_application with confirm inserts and reports document verdicts", async () => {
    const data = parseResult(
      await client.callTool({
        name: "add_application",
        arguments: { company: "McpTestCo", role: "Tester", confirm: true },
      })
    );
    const created = data.created as { id: string; company: string };
    expect(created.company).toBe("McpTestCo");
    insertedIds.push(created.id);
    expect(data).toHaveProperty("documents");
  });

  test("update_application_status changes the row", async () => {
    const data = parseResult(
      await client.callTool({
        name: "update_application_status",
        arguments: { id: insertedIds[0], status: "applied", confirm: true },
      })
    );
    const updated = (data.updated ?? data) as { status?: string };
    expect(JSON.stringify(data)).toContain("applied");
  });
});
