import { ApplicationDraft } from "../../src/application-draft.js";
import type { Profile } from "../../src/profile-schemas.js";

export const applicationProfile: Profile = {
  identity: {
    name: "Alex Rivera",
    email: "alex@example.com",
    phone: "+1 555 0100",
    location: "Remote",
    linkedin: "https://linkedin.com/in/alex",
    blog: "https://portfolio.example.com",
    languages: ["English"],
  },
  skills: [{ category: "Automation", skills: ["Python", "Terraform"] }],
  experience: [
    {
      title: "Platform Engineer",
      company: "Example Labs",
      startDate: "2022",
      endDate: "Present",
      achievements: ["Automated cloud environment delivery with Python and Terraform."],
      responsibilities: ["Maintained deployment tooling with the security team."],
    },
  ],
  education: [{ degree: "BSc", field: "Computer Science", institution: "Example University", endYear: 2021 }],
  certifications: [{ name: "Cloud Fundamentals", date: "2023" }],
  projects: [
    {
      slug: "delivery-pipeline",
      name: "Delivery Pipeline",
      kind: "work",
      summary: "Reusable deployment pipeline for platform teams.",
      domains: ["devops-platform", "automation"],
      stack: ["Python", "Terraform"],
      link: "https://example.com/delivery-pipeline",
    },
  ],
};

export const applicationPosting = "Platform Engineer. Requirements: Python, Terraform, Kubernetes. Build secure delivery automation.";

export function validApplicationDraft() {
  return ApplicationDraft.parse({
    version: 1,
    company: "Acme",
    role: "Platform Engineer",
    language: "English",
    cv: {
      headline: { text: "Platform Engineer focused on secure automation", evidenceIds: ["profile:experience:0", "profile:skill:0:0"] },
      summary: {
        text: "Platform engineer who builds maintainable cloud delivery automation with Python and Terraform, combining hands-on deployment tooling with close security-team collaboration and a practical focus on reliable infrastructure changes.",
        evidenceIds: ["profile:experience:0:achievement:0", "profile:experience:0:responsibility:0"],
      },
      skills: [
        { text: "Python", evidenceIds: ["profile:skill:0:0"] },
        { text: "Terraform", evidenceIds: ["profile:skill:0:1"] },
      ],
      experience: [
        {
          sourceIndex: 0,
          bullets: [
            { text: "Automated cloud environment delivery with Python and Terraform.", evidenceIds: ["profile:experience:0:achievement:0"] },
            { text: "Maintained deployment tooling with the security team.", evidenceIds: ["profile:experience:0:responsibility:0"] },
          ],
        },
      ],
    },
    coverLetter: {
      recipient: "Hiring Manager",
      paragraphs: [
        { text: "Acme needs a platform engineer who can turn infrastructure requirements into reliable delivery automation. My work automating cloud environment delivery with Python and Terraform maps directly to that need.", evidenceIds: ["job:posting", "profile:experience:0:achievement:0"] },
        { text: "At Example Labs, I maintain deployment tooling in close partnership with the security team. That combination of delivery ownership and security collaboration is the experience I would bring to Acme's platform work.", evidenceIds: ["profile:experience:0", "profile:experience:0:responsibility:0", "job:company"] },
        { text: "The role's emphasis on secure delivery automation is especially relevant to how I work: choose maintainable tools, make infrastructure changes repeatable, and keep operational partners involved throughout delivery.", evidenceIds: ["job:posting", "profile:experience:0:responsibility:0"] },
      ],
      closing: "Kind regards,",
    },
    strategy: {
      roleThesis: "Lead with verified delivery automation evidence for this platform role.",
      mustProve: ["Python", "Terraform"],
      evidencePriorities: [
        { evidenceId: "profile:experience:0", priority: 1, reason: "Direct delivery experience", use: "summary and experience bullets" },
        { evidenceId: "profile:project:delivery-pipeline", priority: 2, reason: "Relevant work project", use: "project section" },
      ],
      sectionOrder: ["summary", "experience", "projects", "education", "certifications"],
      keywordsUsed: ["Python", "Terraform"],
      honestGaps: ["Kubernetes"],
    },
  });
}
