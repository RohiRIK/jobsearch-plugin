/**
 * MCP server generated from the command table.
 *
 * Tool schemas are paid for in context on every turn, so the surface is
 * deliberately coarse: a named tool for each high-traffic command
 * (`mcpTool` in the table), `jobsearch_run` for every other read-only
 * command, and `jobsearch_write` for mutations (still `confirm: true` after a
 * human yes). `jobsearch_run {command:"help"}` returns the full flag schema on
 * demand. Results use the same envelope as the CLI.
 *
 * The previous 15-tool server is still `bun run mcp` in a checkout, so
 * existing registrations keep working for one release.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodTypeAny } from "zod";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Profile } from "../profile-schemas.js";
import { buildApplicationBrief } from "../application-draft.js";
import { DATA_DIR } from "../paths.js";
import { AgentError, CONTRACT_VERSION, EXIT, errorEnvelope, toAgentError, type CommandSpec, type Envelope, type Values } from "./contract.js";
import { validateValues, helpJson } from "./cli.js";
import { COMMANDS } from "./registry.js";

const VERSION = "2.0.0";

/** Commands reachable over MCP, partitioned the way the tools expose them. */
export function mcpPartition(commands: Record<string, CommandSpec> = COMMANDS) {
  const offered = Object.entries(commands).filter(([, s]) => !s.cliOnly);
  return {
    named: offered.filter(([, s]) => s.mcpTool && !s.mutation),
    reads: offered.filter(([, s]) => !s.mcpTool && !s.mutation).map(([n]) => n),
    writes: offered.filter(([, s]) => s.mutation).map(([n]) => n),
  };
}

function flagSchema(spec: CommandSpec): Record<string, ZodTypeAny> {
  const shape: Record<string, ZodTypeAny> = {};
  for (const [name, flag] of Object.entries(spec.flags)) {
    // MCP hosts use the workspace profile; --profile is a CLI/test affordance.
    if (name === "yes" || name === "dry-run" || name === "profile") continue;
    let t: ZodTypeAny = flag.type === "boolean" ? z.boolean() : flag.enum ? z.enum(flag.enum as [string, ...string[]]) : z.string();
    t = t.describe(flag.description);
    shape[name] = flag.required ? t : t.optional();
  }
  // Hosts without filesystem access can pass the posting inline.
  if ("job" in spec.flags) {
    shape.job = (shape.job as ZodTypeAny).optional();
    shape.posting_text = z.string().min(20).max(200_000).optional().describe("Posting text instead of a job file");
  }
  return shape;
}

const ArgsRecord = z.record(z.union([z.string(), z.boolean()])).optional().describe("Flags without dashes, e.g. {\"limit\":\"10\"}");

async function execute(command: string, args: Record<string, unknown>): Promise<Envelope & { exit: number }> {
  const spec = COMMANDS[command];
  let tmp: string | undefined;
  try {
    if (!spec || spec.cliOnly) throw new AgentError("usage", `unknown command ${JSON.stringify(command)}`, ["jobsearch_run {\"command\":\"help\"}"]);
    const values: Values = {};
    for (const [k, v] of Object.entries(args)) {
      if (typeof v === "string" || typeof v === "boolean") values[k] = v;
    }
    if (typeof values.posting_text === "string") {
      if (values.job) throw new AgentError("usage", "pass either job or posting_text, not both");
      tmp = mkdtempSync(join(tmpdir(), "jobsearch-mcp-"));
      const file = join(tmp, "posting.txt");
      writeFileSync(file, values.posting_text);
      values.job = file;
      delete values.posting_text;
    }
    const known = new Set([...Object.keys(spec.flags), "fields"]);
    const unknown = Object.keys(values).filter((k) => !known.has(k));
    if (unknown.length) throw new AgentError("usage", `unknown argument(s) for ${command}: ${unknown.join(", ")}`, ["jobsearch_run {\"command\":\"help\"}"]);
    validateValues(command, spec, values);
    const result = await spec.run(values);
    return { ok: true, data: result.data, exit: result.exit ?? EXIT.ok };
  } catch (err) {
    const { envelope, exit } = errorEnvelope(toAgentError(err));
    return { ...envelope, exit };
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

function toolResult(result: Envelope & { exit: number }) {
  const { exit, ...envelope } = result;
  const body = { ...envelope, exit };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(body) }],
    ...(result.ok ? {} : { isError: true }),
  };
}

function readProfile(): Profile | null {
  const path = join(DATA_DIR, "profile.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = Profile.safeParse(JSON.parse(readFileSync(path, "utf-8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "job-search", version: VERSION });
  const { named, reads, writes } = mcpPartition();

  for (const [command, spec] of named) {
    server.registerTool(spec.mcpTool!, { description: spec.summary, inputSchema: flagSchema(spec) }, async (args) =>
      toolResult(await execute(command, args as Record<string, unknown>)),
    );
  }

  server.registerTool(
    "jobsearch_run",
    {
      description: `Read-only commands: ${reads.join(", ")}. "help" returns every command's flags. All tools return {ok,data|error,exit}.`,
      inputSchema: { command: z.enum(["help", ...reads] as [string, ...string[]]), args: ArgsRecord },
    },
    async ({ command, args }) => {
      if (command === "help") return toolResult({ ok: true, data: helpJson(), exit: EXIT.ok });
      return toolResult(await execute(command, args ?? {}));
    },
  );

  server.registerTool(
    "jobsearch_write",
    {
      description: `WRITE commands: ${writes.join(", ")}. Requires confirm: true — get an explicit human yes in-conversation first. dry_run: true previews without writing.`,
      inputSchema: {
        command: z.enum(writes as [string, ...string[]]),
        args: ArgsRecord,
        confirm: z.literal(true),
        dry_run: z.boolean().optional(),
      },
    },
    async ({ command, args, confirm, dry_run }) => {
      if (confirm !== true) return toolResult({ ...errorEnvelope(new AgentError("confirmation_required", "write requires confirm: true")).envelope, exit: EXIT.usage });
      const values = { ...(args ?? {}), ...(dry_run ? { "dry-run": true } : { yes: true }) };
      return toolResult(await execute(command, values));
    },
  );

  server.registerPrompt(
    "tailor_application",
    {
      title: "Tailor a CV and cover letter",
      description: "Draft a factual CV and cover letter from profile evidence and a job posting, returning the ApplicationDraft JSON contract for review and rendering.",
      argsSchema: {
        company: z.string().min(1).max(200),
        role: z.string().min(1).max(200),
        posting_text: z.string().min(20).max(200_000),
        language: z.string().min(2).max(40).optional(),
      },
    },
    ({ company, role, posting_text, language }) => {
      const profile = readProfile();
      const text = profile
        ? buildApplicationBrief({ profile, posting: posting_text, company, role, language }).prompt
        : "Candidate profile is unavailable. Stop and ask the user to set up their profile; do not draft from assumptions.";
      return { messages: [{ role: "user", content: { type: "text", text } }] };
    },
  );

  server.registerResource(
    "weekly-report",
    "jobsearch://reports/latest",
    { title: "Latest weekly report", description: "Most recent weekly review report (markdown)", mimeType: "text/markdown" },
    async (uri) => {
      const dir = join(DATA_DIR, "reports");
      const latest = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith("weekly-")).sort().pop() : undefined;
      const text = latest ? readFileSync(join(dir, latest), "utf-8") : "_No reports yet._";
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    },
  );

  return server;
}

export async function serveMcp(): Promise<void> {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  process.stderr.write(`[jobsearch-mcp] contract v${CONTRACT_VERSION} listening on stdio\n`);
  // Keep the process alive until the client closes stdin.
  await new Promise<void>((resolve) => process.stdin.on("close", () => resolve()));
}
