> Context file of the `outcome` skill — `jobsearch`, `<workspace>` and `<assistant>` are defined in its SKILL.md.

# Reasoning Log

The feedback loop that makes the system learn. Every application outcome feeds back into the reasoning layer: what channels work, which templates get responses, where skill gaps are, which sectors respond.

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **RecordOutcome** | "record outcome", "application rejected/interview", "track result" | `Workflows/RecordOutcome.md` |
| **LogReasoning** | "reasoning entry", "what I learned", "pattern I noticed" | `Workflows/LogReasoning.md` |
| **AnalyzePatterns** | "analyze patterns", "what's working", "response rates" | `Workflows/AnalyzePatterns.md` |

## Quick Reference

- Outcomes stored in `<workspace>/data/outcomes.json`
- Reasoning log stored in `<workspace>/data/reasoning.json`
- Entry types: `channel_effectiveness`, `template_effectiveness`, `skill_gap`, `sector_fit`, `cover_letter_style`, `timing`, `general`
- Confidence levels: `low` (1 application), `medium` (2-5), `high` (6+)
- Evidence links back to application IDs for traceability

## Commands

```bash
# Record outcomes
jobsearch run outcome set <app-id> --status rejected --reason "lacked experience"
jobsearch run outcome list

# Log reasoning
jobsearch run reason log --type skill_gap --finding "fintech experience missing" --confidence medium

# Analyze
jobsearch run reason analyze
jobsearch run reason summary
jobsearch run reason query --type skill_gap
```

## Gotchas

- `reason analyze` scans outcomes, not reasoning entries — it computes stats from `<workspace>/data/outcomes.json`
- Confidence is per-entry, not per-finding — multiple low-confidence entries don't automatically become medium
- The `--evidence` flag is repeatable: `--evidence "app_123: 2 responses" --evidence "app_456: no response"`
- Outcome recording auto-generates a reasoning prompt for rejections (suggesting what type of reasoning entry to create)
- Bulk import from CSV expects columns: `id,company,role,sector,channel,status,date,response_days,interviews,reason,notes`

## Examples

**Example 1: Record a rejection and create reasoning entry**
```
User: "I got rejected from Leumi for lacking fintech experience"
→ Outcome set app_20260701_leumi --status rejected --reason "lacked fintech experience"
→ System prompts: "Is this a skill gap? Record with reason log --type skill_gap"
→ User runs: reason log --type skill_gap --finding "fintech domain experience missing" --confidence low --evidence "app_20260701_leumi"
```

**Example 2: Analyze what's working**
```
User: "What channels are giving me the best response?"
→ reason analyze computes stats from outcomes
→ reason summary shows bestChannel, responseRate, topRejectionReasons
```
