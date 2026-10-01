import { describe, expect, test } from "bun:test";
import type { PortfolioProject } from "../src/profile-schemas.js";
import { containsPhrase, detectJobDomains, scoreProject, selectProjects } from "../src/project-matching.js";

const project = (p: Partial<PortfolioProject> & { slug: string; name: string }): PortfolioProject => ({
  kind: "personal",
  summary: "",
  domains: [],
  stack: [],
  ...p,
});

const FLEETWATCH = project({
  slug: "fleetwatch",
  name: "FleetWatch",
  kind: "work",
  summary: "Intune device-management dashboard for large fleets: sub-second search, real-time compliance, identity correlation.",
  domains: ["endpoint-management", "data-engineering"],
  stack: ["Next.js", "PostgreSQL", "Intune", "TypeScript", "OpenSearch"],
  impact: "Sub-second search across a 10K+ device fleet",
});

const AEGIS = project({
  slug: "project-aegis",
  name: "Project Aegis",
  summary: "RAG-based SOC assistant over real security documentation.",
  domains: ["ml-ai", "cloud-security"],
  stack: ["LangChain", "Gemini", "Pinecone", "Python", "Docker"],
});

const HOMELAB = project({
  slug: "homelab-swarm-stack",
  name: "Homelab Docker Swarm",
  summary: "Self-hosted infrastructure: Docker Swarm, Traefik ingress, monitoring.",
  domains: ["devops-platform"],
  stack: ["Docker", "Traefik", "Prometheus", "Grafana"],
});

const AIR_QUALITY = project({
  slug: "air-quality-automation",
  name: "Air Quality Automation",
  summary: "Environmental monitoring on Orange Pi with a BME680 sensor.",
  domains: ["iot-hardware"],
  stack: ["Docker", "Python", "Orange Pi"],
});

const HIBOB = project({
  slug: "hr-chat-sync",
  name: "HR-Chat-Sync",
  kind: "work",
  summary: "Syncs employee photos from an HRIS to Microsoft Teams via Graph API.",
  domains: ["automation", "identity-access"],
  stack: ["Microsoft Graph", "TypeScript", "HRIS"],
});

const ALL = [FLEETWATCH, AEGIS, HOMELAB, AIR_QUALITY, HIBOB];

const ML_JOB = `AI Engineer — build LLM-powered products. You will work on RAG pipelines,
vector databases and embeddings, fine-tune models, and ship generative AI features.
Python, PyTorch, Docker. Experience with prompt engineering and agentic systems.`;

const ENDPOINT_JOB = `Endpoint Engineer — own our Intune estate. Device management,
Autopilot provisioning, device compliance policies across a large fleet. You will build
internal tooling and reporting. PowerShell, TypeScript, SQL.`;

describe("detectJobDomains", () => {
  test("reads an AI posting as ml-ai", () => {
    expect(detectJobDomains(ML_JOB)[0]).toBe("ml-ai");
  });

  test("reads an endpoint posting as endpoint-management", () => {
    expect(detectJobDomains(ENDPOINT_JOB)[0]).toBe("endpoint-management");
  });

  test("returns nothing for a posting with no recognisable domain", () => {
    expect(detectJobDomains("We are hiring a friendly person for a fun team.")).toEqual([]);
  });
});

// The case this module exists for, stated directly: endpoint work is not
// evidence for an ML role, and an ML assistant is not evidence for an endpoint
// role — even though both share Docker, Python and a dashboard.
describe("the wrong project never reaches the CV", () => {
  test("an AI role does not get the endpoint dashboard", () => {
    const { selected } = selectProjects(ALL, ML_JOB);
    expect(selected.map((m) => m.project.slug)).not.toContain("fleetwatch");
  });

  test("an AI role leads with the RAG assistant", () => {
    const { selected } = selectProjects(ALL, ML_JOB);
    expect(selected[0].project.slug).toBe("project-aegis");
  });

  test("an endpoint role leads with FleetWatch", () => {
    const { selected } = selectProjects(ALL, ENDPOINT_JOB);
    expect(selected[0].project.slug).toBe("fleetwatch");
  });

  test("an endpoint role does not get the RAG assistant", () => {
    const { selected } = selectProjects(ALL, ENDPOINT_JOB);
    expect(selected.map((m) => m.project.slug)).not.toContain("project-aegis");
  });

  test("shared stack alone does not carry a project across domains", () => {
    // Air quality shares Docker and Python with the AI posting and nothing else.
    const { selected } = selectProjects(ALL, ML_JOB);
    expect(selected.map((m) => m.project.slug)).not.toContain("air-quality-automation");
  });

  test("an excluded project says why", () => {
    const { rejected } = selectProjects(ALL, ML_JOB);
    const fleet = rejected.find((m) => m.project.slug === "fleetwatch");
    expect(fleet?.excludedBecause ?? fleet?.reason).toContain("ml-ai");
  });
});

describe("ranking", () => {
  test("client work outranks a personal project at equal domain fit", () => {
    const posting = "Automation Engineer — Microsoft Graph, workflow orchestration, lifecycle integration.";
    const domains = detectJobDomains(posting);
    const work = scoreProject(HIBOB, posting, domains);
    const personal = scoreProject({ ...HIBOB, slug: "x", kind: "personal" }, posting, domains);
    expect(work.score).toBeGreaterThan(personal.score);
  });

  test("a stated impact adds weight", () => {
    const domains = detectJobDomains(ENDPOINT_JOB);
    const withImpact = scoreProject(FLEETWATCH, ENDPOINT_JOB, domains);
    const without = scoreProject({ ...FLEETWATCH, impact: undefined }, ENDPOINT_JOB, domains);
    expect(withImpact.score).toBeGreaterThan(without.score);
  });

  test("every selection explains itself", () => {
    for (const m of selectProjects(ALL, ENDPOINT_JOB).selected) {
      expect(m.reason.length).toBeGreaterThan(0);
    }
  });

  test("caps how many projects reach the CV", () => {
    expect(selectProjects(ALL, ENDPOINT_JOB, { limit: 2 }).selected.length).toBeLessThanOrEqual(2);
  });

  // A CV padded with unrelated work is worse than a short, sharp one.
  test("selects nothing rather than padding when no project fits", () => {
    const unrelated = "Pastry Chef — laminated doughs, viennoiserie, early mornings.";
    expect(selectProjects(ALL, unrelated).selected).toEqual([]);
  });
});

// Both of these were found on real portfolio data after the synthetic tests
// above were already green. They are the reason matching is anchored to word
// boundaries and inferred from curated text only.
describe("substring hazards", () => {
  test("'llm' does not match inside 'enrollment'", () => {
    expect(containsPhrase("automated unenrollment and Autopilot provisioning", "llm")).toBe(false);
  });

  test("'llm' still matches when the posting means it", () => {
    expect(containsPhrase("experience with LLM evaluation", "llm")).toBe(true);
  });

  test("an MDM migration posting is not read as an ML role", () => {
    const mdm = "MDM consolidation from JumpCloud to Microsoft Intune — automated unenrollment, Autopilot provisioning.";
    expect(detectJobDomains(mdm)).not.toContain("ml-ai");
  });

  test("a device-migration project is not selected for an AI role", () => {
    const jumpcloud = project({
      slug: "mdm-to-intune-migration",
      name: "JumpCloud to Intune Migration",
      kind: "work",
      summary: "MDM consolidation from JumpCloud to Microsoft Intune — automated unenrollment, Autopilot provisioning, policy parity.",
      domains: ["endpoint-management", "cloud-infrastructure"],
      stack: ["PowerShell", "Intune"],
    });
    const { selected } = selectProjects([jumpcloud, AEGIS], ML_JOB);
    expect(selected.map((m) => m.project.slug)).not.toContain("mdm-to-intune-migration");
    expect(selected.map((m) => m.project.slug)).toContain("project-aegis");
  });
});

// Found on a real Berlin posting: "Platform and Integration Engineer, Security
// Telemetry". Body text was dominated by Docker/CI-CD/monitoring, so raw hit
// counting ranked platform above security and put an Orange Pi sensor project
// ahead of client security work.
describe("solution-engineering routing", () => {
  const solutionProject: PortfolioProject = {
    slug: "client-discovery",
    name: "Client Discovery & Security Architecture Assessment",
    kind: "work",
    summary: "Discovery and architecture assessment",
    domains: ["solution-engineering"],
    stack: ["Microsoft 365"],
  };

  test("selects delivery-stage evidence for solution-engineering roles", () => {
    const posting = "Microsoft Security Solution Engineer. Lead discovery workshops, create technical demos, and validate proof of concept deployments.";
    const result = selectProjects([solutionProject], posting);

    expect(result.jobDomains).toContain("solution-engineering");
    expect(result.selected.map((entry) => entry.project.slug)).toContain("client-discovery");
  });

  test("keeps delivery-stage evidence off cloud-security roles without solution cues", () => {
    const posting = "Cloud Security Engineer. Build Microsoft Sentinel detections and improve Defender incident response.";
    const result = selectProjects([solutionProject], posting);

    expect(result.selected).toEqual([]);
  });
});

describe("multi-domain postings", () => {
  const SECURITY_TELEMETRY = `Platform and Integration Engineer, Security Telemetry
Design ingestion pipelines for SIEM, EDR and NDR telemetry. Build containerized services
with deployment automation, monitoring and health checks. Docker, CI/CD, Linux, Python,
networking, TLS, DNS. Understanding of security telemetry structures.`;

  test("the job title outweighs body-text frequency", () => {
    expect(detectJobDomains(SECURITY_TELEMETRY)[0]).toBe("cloud-security");
  });

  test("a Solutions Engineer title remains the lead domain despite many cloud platform mentions", () => {
    const posting = `Solutions Engineer, Benelux
Pre-sales solution design with Azure, AWS, GCP, Terraform, networking, and cloud architecture.`;
    expect(detectJobDomains(posting)[0]).toBe("solution-engineering");
  });

  test("matching the lead domain beats matching several secondary ones", () => {
    const domains = detectJobDomains(SECURITY_TELEMETRY);
    const leadMatch = scoreProject(
      project({ slug: "zt", name: "Zero Trust", kind: "work", summary: "", domains: ["cloud-security"], stack: [] }),
      SECURITY_TELEMETRY,
      domains,
    );
    const secondariesOnly = scoreProject(
      project({ slug: "iot", name: "Air Quality", summary: "", domains: ["devops-platform", "automation"], stack: ["Docker", "Python"] }),
      SECURITY_TELEMETRY,
      domains,
    );
    expect(leadMatch.score).toBeGreaterThanOrEqual(secondariesOnly.score);
  });

  test("at an equal score, lead-domain client work ranks first", () => {
    const zt = project({ slug: "zt", name: "Zero Trust", kind: "work", summary: "", domains: ["cloud-security"], stack: [] });
    const iot = project({ slug: "iot", name: "Air Quality", summary: "", domains: ["devops-platform", "automation"], stack: ["Docker", "Python"] });
    expect(selectProjects([iot, zt], SECURITY_TELEMETRY).selected[0].project.slug).toBe("zt");
  });
});
