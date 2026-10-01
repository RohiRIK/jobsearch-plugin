#!/usr/bin/env bun
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { getTracker } from "../../src/tracker.js";
import { JobApplicationCreate, SeenJobsFile, generateApplicationId, ApplicationStatus } from "../../src/schemas.js";
import { Profile, ReasoningLog } from "../../src/profile-schemas.js";
import { buildDashboard } from "../dashboard.js";
import { summarizeText } from "../jobs/summarize.js";
import { scoreJob } from "../match/score-job.js";
import { z } from "zod";
import { CODE_ROOT, WORKSPACE as ROOT } from "../../src/paths.js";

const PUBLIC_DIR = join(CODE_ROOT, "scripts", "api", "public");

const HELP = `api — Local REST API + web dashboard for the job search workspace

USAGE
  bun run scripts/api/server.ts [--port N]

FLAGS
  --help, -h          Show this help message
  --port <N>          Port to listen on (default: 8317)

ENDPOINTS
  GET  /                      Web dashboard (static HTML)
  GET  /api/profile           Candidate profile
  GET  /api/jobs              Seen jobs (?status=new&market=il)
  GET  /api/applications      Tracked applications (?status=applied)
  POST /api/applications      Create application (JobApplicationCreate JSON)
  PATCH /api/applications/:id Update application ({ status?, notes?, ... })
  GET  /api/analytics         Dashboard data (pipeline, metrics, channels)
  GET  /api/reasoning         Reasoning log entries
  POST /api/score             Score a job ({ text, title?, company? })

SECURITY
  Binds to 127.0.0.1 only. Set API_KEY in .env to additionally require
  an "x-api-key" header on /api/* routes.

OUTPUT
  JSON responses; errors as { error, code } with 4xx/5xx status.
  Exit code: 0 = clean shutdown, 1 = startup error
`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json", "x-content-type-options": "nosniff" },
  });
}

function keyMatches(provided: string | null, required: string): boolean {
  if (provided === null) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(required).digest();
  return timingSafeEqual(a, b);
}

function readJsonFile(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

const ScoreRequest = z.object({
  text: z.string().min(1).max(200_000),
  title: z.string().optional(),
  company: z.string().optional(),
});

const ApplicationPatch = z.object({
  status: ApplicationStatus.optional(),
  notes: z.string().optional(),
  channel: z.string().optional(),
  fit_rating: z.number().int().min(0).max(100).optional(),
  contact_person: z.string().optional(),
  sector: z.string().optional(),
});

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.startsWith("/api/")) {
    const requiredKey = process.env.API_KEY;
    if (requiredKey && !keyMatches(req.headers.get("x-api-key"), requiredKey)) {
      return json({ error: "Missing or invalid x-api-key header", code: "UNAUTHORIZED" }, 401);
    }
  }

  if (path === "/" || path === "/index.html") {
    const indexPath = join(PUBLIC_DIR, "index.html");
    if (!existsSync(indexPath)) return json({ error: "Dashboard not built", code: "NO_DASHBOARD" }, 404);
    return new Response(readFileSync(indexPath), {
      headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff" },
    });
  }

  if (path === "/api/profile" && req.method === "GET") {
    const raw = readJsonFile(join(ROOT, "data", "profile.json"));
    if (!raw) return json({ error: "Profile not found. Run: bun run profile", code: "NO_PROFILE" }, 404);
    const parsed = Profile.safeParse(raw);
    return parsed.success ? json(parsed.data) : json({ error: "Profile invalid", code: "BAD_PROFILE" }, 500);
  }

  if (path === "/api/jobs" && req.method === "GET") {
    const raw = readJsonFile(join(ROOT, "data", "seen-jobs.json"));
    const parsed = SeenJobsFile.safeParse(raw ?? { seen: {} });
    if (!parsed.success) return json({ error: "seen-jobs.json invalid", code: "BAD_FILE" }, 500);
    let jobs = Object.values(parsed.data.seen);
    const status = url.searchParams.get("status");
    const market = url.searchParams.get("market");
    if (status) jobs = jobs.filter((j) => j.status === status);
    if (market) jobs = jobs.filter((j) => j.market === market);
    return json({ jobs, total: jobs.length });
  }

  if (path === "/api/applications" && req.method === "GET") {
    const status = url.searchParams.get("status") ?? undefined;
    return json({ applications: getTracker().list(status ? { status } : undefined) });
  }

  if (path === "/api/applications" && req.method === "POST") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body", code: "BAD_JSON" }, 400);
    }
    const withId = { id: generateApplicationId((body as Record<string, unknown>)?.company as string ?? "unknown"), date: new Date().toISOString().slice(0, 10), status: "planning", ...(body as Record<string, unknown>) };
    const parsed = JobApplicationCreate.safeParse(withId);
    if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.issues, code: "VALIDATION" }, 400);
    return json(getTracker().insert(parsed.data), 201);
  }

  const patchMatch = path.match(/^\/api\/applications\/([^/]+)$/);
  if (patchMatch && req.method === "PATCH") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body", code: "BAD_JSON" }, 400);
    }
    const parsed = ApplicationPatch.safeParse(body);
    if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.issues, code: "VALIDATION" }, 400);
    const updated = getTracker().update(patchMatch[1], parsed.data);
    return updated ? json(updated) : json({ error: `Not found: ${patchMatch[1]}`, code: "NOT_FOUND" }, 404);
  }

  if (path === "/api/analytics" && req.method === "GET") {
    return json(buildDashboard());
  }

  if (path === "/api/reasoning" && req.method === "GET") {
    const raw = readJsonFile(join(ROOT, "data", "reasoning.json"));
    const parsed = ReasoningLog.safeParse(raw ?? { entries: [] });
    return parsed.success ? json(parsed.data) : json({ error: "reasoning.json invalid", code: "BAD_FILE" }, 500);
  }

  if (path === "/api/score" && req.method === "POST") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body", code: "BAD_JSON" }, 400);
    }
    const parsed = ScoreRequest.safeParse(body);
    if (!parsed.success) return json({ error: "Body must be { text, title?, company? }", code: "VALIDATION" }, 400);
    const rawProfile = readJsonFile(join(ROOT, "data", "profile.json"));
    const profile = Profile.safeParse(rawProfile);
    if (!profile.success) return json({ error: "Profile not available. Run: bun run profile", code: "NO_PROFILE" }, 409);
    const jd = summarizeText(parsed.data.text, { title: parsed.data.title, company: parsed.data.company });
    return json(scoreJob(jd, profile.data));
  }

  return json({ error: `No route: ${req.method} ${path}`, code: "NOT_FOUND" }, 404);
}

function parsePort(argv: string[]): number | null {
  const i = argv.indexOf("--port");
  if (i === -1) return 8317;
  const port = parseInt(argv[i + 1], 10);
  return Number.isNaN(port) || port < 1 || port > 65535 ? null : port;
}

export function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(HELP);
    return 0;
  }
  const port = parsePort(argv);
  if (port === null) {
    process.stderr.write(JSON.stringify({ error: "--port must be 1-65535", code: "BAD_FLAG" }) + "\n");
    return 1;
  }

  // HOST is for containers (Dockerfile sets 0.0.0.0; compose still maps 127.0.0.1 host-side).
  // Local runs keep the loopback-only default.
  const hostname = process.env.HOST ?? "127.0.0.1";
  try {
    Bun.serve({ hostname, port, fetch: handleRequest });
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err instanceof Error ? err.message : String(err), code: "BIND_FAILED" }) + "\n");
    return 1;
  }
  process.stdout.write(JSON.stringify({ listening: `http://${hostname}:${port}`, dashboard: "/", api: "/api/*" }) + "\n");
  return 0;
}

if (import.meta.main) {
  const code = main();
  if (code !== 0) process.exit(code);
}
