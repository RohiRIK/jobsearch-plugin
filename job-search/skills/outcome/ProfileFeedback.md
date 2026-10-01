> Context file of the `outcome` skill — `jobsearch`, `<workspace>` and `<assistant>` are defined in its SKILL.md.

# Profile Feedback

Turns reasoning insights into profile actions. Reads the reasoning log and produces suggestions: which skills to add, which channels to prioritize, which templates to use.

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **GetSuggestions** | "suggest improvements", "what should I change", "profile feedback" | `Workflows/GetSuggestions.md` |
| **AnalyzeGaps** | "skill gaps", "what's missing", "rejection patterns" | `Workflows/AnalyzeGaps.md` |
| **RankChannels** | "best channels", "which job boards work", "channel effectiveness" | `Workflows/RankChannels.md` |

## Quick Reference

- Reads `<workspace>/data/reasoning.json` (entries + summary)
- Suggestions link back to evidence (application IDs, entry counts)
- `--apply` flag marks suggestions as applied in the reasoning log
- Skill gaps require 2+ citations with confidence ≥ medium
- Channel/template rankings use both reasoning entries and summary stats

## Commands

```bash
# Skill gaps from rejections
jobsearch run feedback gaps

# Channel effectiveness ranking
jobsearch run feedback channels

# Template effectiveness ranking
jobsearch run feedback templates

# Actionable suggestions
jobsearch run feedback suggest
jobsearch run feedback suggest --apply
```

## Gotchas

- Suggestions are recommendations, not automatic changes — profile.json requires manual review
- `--apply` marks reasoning entries as applied, it doesn't modify profile.json directly
- Gaps need 2+ citations to appear — single occurrences are noise, not signal
- Channel ranking uses reasoning entries (qualitative), while `reason summary` uses outcomes (quantitative)
- Empty results mean no reasoning entries of that type exist yet — record more outcomes first

## Examples

**Example 1: Get skill gap suggestions**
```
User: "What skills am I missing based on rejections?"
→ feedback gaps scans skill_gap entries with confidence ≥ medium
→ Returns: [{ finding: "fintech experience", citations: 3, evidence: ["app_123", "app_456", "app_789"] }]
```

**Example 2: Get channel ranking**
```
User: "Which job boards should I focus on?"
→ feedback channels ranks by reasoning entry count and confidence
→ Returns: [{ channel: "linkedin", findings: 5, confidence: "high" }, ...]
```
