# CV failure patterns

The rubric critic (`agents/reviewer.md`) names these patterns by id in
`failingPatterns`. Each is a failure signature from the CV quality audit
(AUDIT.md §2b), with one negative example and the fix. `src/failure-patterns.ts`
is the machine-readable copy that goes into `critique.prompt`; a test keeps the
two in step.

**The examples are synthetic**, written for the example persona (a platform
engineer at "Example Labs"). They are not taken from a real CV. Anonymised
passages from real failing resumes will replace them once they are available.

| Id | Section | Signature | Synthetic example of the failure | Fix |
|---|---|---|---|---|
| F1 | summary | The opening leads with a commodity skill (Python, cloud, security) instead of the posting's top requirement; it would fit any job. | Python professional with cloud and security experience who enjoys solving problems. | Open with the role identity and the proof for the top-ranked requirement in the evidence matrix. |
| F2 | summary | The draft hedges with or pads in skills the candidate lacks (gaps) instead of leaving them out or disclosing them plainly. | Familiar with Kubernetes concepts and ready to apply them across the platform. | Leave gaps out of the CV; disclose one plainly in the cover letter only when it helps. |
| F3 | summary | A technology list with no value proposition, scope or reason this team gets something from the hire. | Engineer skilled in Python, Terraform, Docker, Linux, Git and CI/CD pipelines. | Say who the candidate is for this role, one concrete proof, and what the team gets. |
| F4 | headline | The headline is a pipe- or comma-separated keyword string copied from the profile. | Platform Engineer \| Python \| Terraform \| Docker \| Linux | Name the target role and one or two differentiating domains in at most 10 words. |
| F5 | skills | A flat dump under the profile's own category names, not grouped or ordered by the posting. | Tools: Python, Terraform, Docker, Bash, Git, Jira, Confluence, Linux, Excel | Group by the posting's capability areas, order by requirement rank, cut what the posting does not ask for. |
| F6 | skills | A skill reads as an unsupported claim because its only evidence is its own saved skill label. | Zero Trust architecture (cited only as profile:skill) | Cite the responsibility, achievement or project that proves it, or leave it out. |
| F7 | experience | A bullet paraphrases a responsibility with no problem, result or scope, or lists many tools in one line. | Responsible for maintaining deployment tooling with the security team using Python, Terraform, Docker, Git and Jenkins. | Action + object + method + result or scope from the evidence; one requirement per bullet. |
| F8 | experience | The same work appears in the summary, skills and several bullets with the same wording. | Automated cloud environment delivery (summary), Cloud environment delivery automation (skills), Automated cloud delivery (two bullets) | State each piece of work once where it proves the most; refer back with different wording. |
| F9 | projects | Defensive disclosure notes in the copy ("personal side project, unrelated to my employer"). | Delivery Pipeline (personal side project, unrelated to Example Labs) | The project's kind carries personal or work status; the copy states the problem and what was built. |
| F10 | projects | A project blurb is a feature list with no problem, approach or outcome. | Delivery Pipeline: YAML config, plugin system, dashboards, notifications, CLI. | Problem, then what was built, then the outcome or scope the evidence states. |
| F11 | document | Robotic phrases and clichés (results-driven, proven track record, passionate, leverage). | Results-driven engineer with a proven track record of leveraging cutting-edge tools. | Cut the phrase; state the specific work and its scope. |
| F12 | document | Keyword stuffing and synonym-chasing: filler sentences that exist to repeat posting terms. | Delivers secure cloud solutions for secure cloud environments with cloud security best practices. | Use the posting's exact term once where the evidence supports it; leave real gaps visible. |
| F13 | portfolio | The portfolio is a profile dump with no role targeting, narrative or project frame. | Skills (all) followed by raw responsibilities and an unfiltered repository list. | Portfolio v2 (PR 5): featured case studies framed as problem, approach and outcome. |

F13 belongs to the portfolio critic (PR 5); the CV critic checks F1-F12.

## Deterministic checks that back these patterns

`jobsearch review` catches the mechanical part of several patterns before the
critic runs:

| Code | Pattern | Severity (contract v2) |
|---|---|---|
| `BANNED_PHRASE` | F11 | error |
| `SKILL_SELF_CITED` | F6 | error |
| `RAW_PARAPHRASE`: a bullet shares 70% or more of its word trigrams with its responsibility line or the posting; or the summary does with the posting | F7 | error |
| `FIRST_BULLET_OFF_THESIS`: the first bullet of the first role neither cites nor names `mustProve[0]` when that role has a matrix line for it | F1 | error |
| `HEADLINE_KEYWORD_LIST`, `HEADLINE_COPIED` | F4 | warning |
| `SUMMARY_TOOL_LIST` | F3 | warning |
| `BULLET_TOOL_LIST` | F7 | warning |
| `ADJECTIVE_STACK`: three or more adjectives before a noun | F11 | warning |
| `REPEATED_LEAD_VERB` | F8 | warning |
