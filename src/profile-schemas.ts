import { z } from "zod";

// ─── Profile Schemas ──────────────────────────────────────────────────────

export const Identity = z.object({
  name: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  languages: z.array(z.string()).optional(),
  linkedin: z.string().url().nullable().optional(),
  github: z.string().url().nullable().optional(),
  blog: z.string().url().nullable().optional(),
  /** Optional site-relative avatar/portrait path; never used as ATS contact text. */
  avatar: z.string().optional(),
  headline: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

export type Identity = z.infer<typeof Identity>;

export const Education = z.object({
  degree: z.string(),
  field: z.string(),
  institution: z.string(),
  location: z.string().optional(),
  startYear: z.number().optional(),
  endYear: z.number().optional(),
  thesis: z.string().optional(),
  topics: z.array(z.string()).optional(),
});

export type Education = z.infer<typeof Education>;

export const Experience = z.object({
  /** Stable local identifier used to link work projects to the role that produced them. */
  id: z.string().optional(),
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  /** Military service is valid profile evidence but not technical role tenure. */
  experienceType: z.enum(["professional", "military-service"]).optional(),
  responsibilities: z.array(z.string()).optional(),
  /** Master-profile evidence intentionally excluded from default employer CV bullets. */
  supplementalResponsibilities: z.array(z.string()).optional(),
  achievements: z.array(z.string()).optional(),
  /** Slugs of approved work projects delivered during this role. */
  projectSlugs: z.array(z.string()).optional(),
});

export type Experience = z.infer<typeof Experience>;

export const SkillCategory = z.object({
  category: z.string(),
  skills: z.array(z.string()),
});

export type SkillCategory = z.infer<typeof SkillCategory>;


/**
 * A portfolio project.
 *
 * `domains` is the field that decides whether a project belongs on a given CV.
 * An endpoint-management project is strong evidence for a device/tooling role
 * and irrelevant noise for an ML engineer, so relevance is matched on domain
 * rather than on keyword overlap with the summary, which would surface any
 * project that merely mentions "Python".
 */
export const PortfolioProject = z.object({
  /** Stable slug, usually the blog MDX filename. */
  slug: z.string(),
  name: z.string(),
  /** Client/employer work, or personal — a CV usually leads with the former. */
  kind: z.enum(["work", "personal"]),
  summary: z.string(),
  /** Domain tags matched against the posting. See PROJECT_DOMAINS. */
  domains: z.array(z.string()).default([]),
  /** Concrete technologies, matched against the posting's required skills. */
  stack: z.array(z.string()).default([]),
  link: z.string().optional(),
  /** Optional showcase image URL or site-relative path. Never required for CV evidence. */
  image: z.string().optional(),
  /** Outcome worth quoting on a CV, when there is a real one. */
  impact: z.string().optional(),
  /** Link client/work projects to the professional experience that owns them. */
  engagementId: z.string().optional(),
  clientContext: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  interviewStories: z.array(z.object({
    question: z.string().min(1),
    evidence: z.string().min(1),
  })).optional(),
  /** User-controlled publication gate. Imported projects remain unreviewed by default. */
  disclosure: z.enum(["approved", "restricted", "unreviewed"]).optional(),
  publishedAt: z.string().optional(),
});
export type PortfolioProject = z.infer<typeof PortfolioProject>;

export const Profile = z.object({
  identity: Identity,
  education: z.array(Education).optional(),
  experience: z.array(Experience).optional(),
  skills: z.array(SkillCategory).optional(),
  /** Tools adjacent to established capabilities; never default CV or fit evidence. */
  adjacentSkills: z.array(SkillCategory).optional(),
  projects: z.array(PortfolioProject).optional(),
  /** Owner-confirmed personal interests, printed verbatim as the CV's last line. */
  interests: z.array(z.string().min(1)).optional(),
  certifications: z
    .array(
      z.object({
        name: z.string(),
        hours: z.number().optional(),
        date: z.string().optional(),
      }),
    )
    .optional(),
  publications: z
    .array(
      z.object({
        authors: z.string(),
        year: z.number(),
        title: z.string(),
        journal: z.string(),
        doi: z.string().optional(),
      }),
    )
    .optional(),
  awards: z
    .array(
      z.object({
        name: z.string(),
        event: z.string(),
        year: z.number(),
      }),
    )
    .optional(),
  behavioral: z
    .object({
      traits: z
        .array(z.object({ trait: z.string(), description: z.string() }))
        .optional(),
      strengths: z.array(z.string()).optional(),
      growthAreas: z.array(z.string()).optional(),
      idealEnvironment: z.string().optional(),
    })
    .optional(),
  excites: z.array(z.string()).optional(),
  targetSectors: z
    .array(
      z.object({
        sector: z.string(),
        companies: z.array(z.string()),
      }),
    )
    .optional(),
  dealBreakers: z.array(z.string()).optional(),
  /** Structured employment constraints used for eligibility, not capability scoring. */
  workPreferences: z
    .object({
      remote: z.boolean(),
      hybrid: z.boolean(),
      relocation: z.boolean(),
      /** Optional: work authorization can be recorded before the owner states an office-day limit. */
      maxOfficeDaysPerWeek: z.number().int().min(0).max(7).optional(),
      /** Confirmed work-authorization facts (e.g. EU citizenship). Free-form; rendered by sync-claude. */
      workAuthorization: z
        .object({
          eu: z.string().optional(),
          note: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  sources: z
    .object({
      github: z.boolean().optional(),
      linkedin: z.boolean().optional(),
      blog: z.boolean().optional(),
      cv: z.boolean().optional(),
      manual: z.boolean().optional(),
    })
    .optional(),
  lastFetched: z.string().datetime().optional(),
  /** Candidate-confirmed manual curation, distinct from external-source import time. */
  curation: z
    .object({
      sourceOfTruth: z.string().min(1),
      method: z.string().min(1),
      lastReviewed: z.string().datetime(),
    })
    .optional(),
});

export type Profile = z.infer<typeof Profile>;

// ─── Reasoning Schemas ────────────────────────────────────────────────────

export const ApplicationStatus = z.enum([
  "planning",
  "applied",
  "interviewing",
  "offered",
  "rejected",
  "withdrawn",
  "no_response",
]);

export type ApplicationStatus = z.infer<typeof ApplicationStatus>;

export const ApplicationOutcome = z.object({
  applicationId: z.string(),
  company: z.string(),
  role: z.string(),
  sector: z.string().optional(),
  channel: z.string(),
  templateUsed: z.string().optional(),
  coverLetterUsed: z.boolean().optional(),
  status: ApplicationStatus,
  responseTimeDays: z.number().optional(),
  interviewCount: z.number().int().optional(),
  rejectionReason: z.string().optional(),
  notes: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ApplicationOutcome = z.infer<typeof ApplicationOutcome>;

export const ReasoningEntry = z.object({
  id: z.string().regex(/^reason_\d{8}_[a-z0-9-]+$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum([
    "channel_effectiveness",
    "template_effectiveness",
    "skill_gap",
    "sector_fit",
    "cover_letter_style",
    "timing",
    "general",
  ]),
  finding: z.string(),
  evidence: z.array(
    z.object({
      applicationId: z.string().optional(),
      data: z.string(),
    }),
  ),
  confidence: z.enum(["low", "medium", "high"]),
  actionItem: z.string().optional(),
  applied: z.boolean().default(false),
});

export type ReasoningEntry = z.infer<typeof ReasoningEntry>;

export const ReasoningLog = z.object({
  entries: z.array(ReasoningEntry),
  summary: z
    .object({
      totalApplications: z.number().int(),
      responseRate: z.number(),
      interviewRate: z.number(),
      offerRate: z.number(),
      bestChannel: z.string().optional(),
      bestTemplate: z.string().optional(),
      avgResponseDays: z.number().optional(),
      topRejectionReasons: z.array(z.string()).optional(),
      lastAnalyzed: z.string().datetime().optional(),
    })
    .optional(),
});

export type ReasoningLog = z.infer<typeof ReasoningLog>;

// ─── Helpers ──────────────────────────────────────────────────────────────

export function generateReasoningId(type: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const slug = type
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `reason_${date}_${slug}`;
}
