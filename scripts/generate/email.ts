#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Profile } from "../../src/profile-schemas.js";
import { getTracker, closeTracker } from "../../src/tracker.js";
import { WORKSPACE as ROOT } from "../../src/paths.js";

const DEFAULT_PROFILE = join(ROOT, "data", "profile.json");

const TYPES = ["followup", "thank-you", "withdraw", "referral"] as const;
type EmailType = (typeof TYPES)[number];

const HELP = `Email Template Generator — application emails from tracker data.

Usage:
  email.ts --type <${TYPES.join("|")}> (--id <app-id> | --company <name> --role <title>) [options]

Options:
  --type <t>            Email type (required): ${TYPES.join(", ")}
  --id <app-id>         Tracker application id — pulls company, role, dates
  --company <name>      Company (when no --id)
  --role <title>        Role (when no --id)
  --contact <name>      Addressee name (default: Hiring Manager)
  --profile <path>      Profile JSON (default: data/profile.json)
  --format <json|text>  Output format (default: json)
  -h, --help            Show this help

Output: JSON { type, subject, body, context }. Exit 0/1.
Drafts are templates — personalize before sending.`;

interface EmailContext {
  company: string;
  role: string;
  contact: string;
  senderName: string;
  appliedDate?: string;
  daysSinceApplied?: number;
}

export function buildEmail(type: EmailType, ctx: EmailContext): { subject: string; body: string } {
  const { company, role, contact, senderName } = ctx;
  const since =
    ctx.daysSinceApplied !== undefined && ctx.appliedDate
      ? `on ${ctx.appliedDate} (${ctx.daysSinceApplied} days ago)`
      : "recently";

  switch (type) {
    case "followup":
      return {
        subject: `Following up — ${role} application`,
        body: `Dear ${contact},

I applied for the ${role} position at ${company} ${since} and wanted to follow up. I remain very interested in the role and would welcome the chance to discuss how my background fits your needs.

If any additional information would be helpful, I am happy to provide it.

Kind regards,
${senderName}`,
      };
    case "thank-you":
      return {
        subject: `Thank you — ${role} interview`,
        body: `Dear ${contact},

Thank you for taking the time to speak with me about the ${role} position at ${company}. The conversation strengthened my interest in the role and the team.

I look forward to the next steps. Please reach out if you need anything further from my side.

Kind regards,
${senderName}`,
      };
    case "withdraw":
      return {
        subject: `Withdrawing my application — ${role}`,
        body: `Dear ${contact},

I am writing to withdraw my application for the ${role} position at ${company}. I appreciate the time you have invested in my candidacy.

I hope our paths cross again, and I wish you success in filling the role.

Kind regards,
${senderName}`,
      };
    case "referral":
      return {
        subject: `Quick question about ${company}`,
        body: `Hi ${contact},

I hope you are doing well. I noticed an opening for a ${role} at ${company} and I am seriously considering applying. Since you know the company from the inside, I would value your perspective — and if you feel comfortable, a referral would mean a lot.

Happy to send over my CV and a short summary of my background. No pressure either way.

Best,
${senderName}`,
      };
  }
}

export async function main(): Promise<number> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      type: { type: "string" },
      id: { type: "string" },
      company: { type: "string" },
      role: { type: "string" },
      contact: { type: "string" },
      profile: { type: "string" },
      format: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
  });

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  const type = values.type as EmailType;
  if (!TYPES.includes(type)) {
    process.stderr.write(JSON.stringify({ error: `--type must be one of: ${TYPES.join(", ")}`, code: "BAD_ARGS" }) + "\n");
    return 1;
  }

  let company = typeof values.company === "string" ? values.company : "";
  let role = typeof values.role === "string" ? values.role : "";
  let appliedDate: string | undefined;
  let daysSinceApplied: number | undefined;

  if (typeof values.id === "string") {
    const tracker = getTracker();
    try {
      const app = tracker.get(values.id);
      if (!app) {
        process.stderr.write(JSON.stringify({ error: `no application with id ${values.id}`, code: "NOT_FOUND" }) + "\n");
        return 1;
      }
      company = app.company;
      role = app.role;
      appliedDate = app.date;
      daysSinceApplied = Math.floor((Date.now() - new Date(app.date).getTime()) / 86_400_000);
    } finally {
      closeTracker();
    }
  }

  if (!company || !role) {
    process.stderr.write(JSON.stringify({ error: "need --id or both --company and --role", code: "BAD_ARGS" }) + "\n");
    return 1;
  }

  let senderName = "";
  const profilePath = typeof values.profile === "string" ? resolve(process.cwd(), values.profile) : DEFAULT_PROFILE;
  if (existsSync(profilePath)) {
    try {
      const profile = Profile.parse(JSON.parse(readFileSync(profilePath, "utf-8")));
      senderName = profile.identity?.name ?? "";
    } catch {
      senderName = "";
    }
  }

  const ctx: EmailContext = {
    company,
    role,
    contact: typeof values.contact === "string" ? values.contact : "Hiring Manager",
    senderName: senderName || "[your name]",
    appliedDate,
    daysSinceApplied,
  };

  const email = buildEmail(type, ctx);

  if (values.format === "text") {
    process.stdout.write(`Subject: ${email.subject}\n\n${email.body}\n`);
  } else {
    process.stdout.write(JSON.stringify({ type, ...email, context: ctx }, null, 2) + "\n");
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
