# build — Document Build CLI

Unified entry point for document generation. Detects input format, picks the right engine (Typst primary, LaTeX fallback), validates output.

## Commands

| Command | Description |
|---------|-------------|
| `build <file>` | Build a single document (Typst or LaTeX → PDF) |
| `build --all` | Build all templates in `cv/` and `cover_letters/` |
| `verify` | Verify existing PDFs (ATS text layer, page count) |
| `pipeline <company> <role>` | Run 5-step application pipeline (dry run) |
| `config` | Show current build configuration |

## Usage

```bash
# Build a Typst CV
bun run scripts/build/cli.ts build cv/banking/template.typ

# Build everything
bun run scripts/build/cli.ts build --all

# Run pipeline for a job application
bun run scripts/build/cli.ts pipeline Acme "ML Engineer"

# Show config
bun run scripts/build/cli.ts config
```

## Engine Detection

| Input | Engine | Notes |
|-------|--------|-------|
| `.typ` | Typst | Primary, fast (~50ms) |
| `.tex` (moderncv) | lualatex | Fallback, requires LaTeX |
| `.tex` (other) | xelatex | Fallback for cover letters |

## Configuration

### `data/config.json`

Controls naming convention and output directories:

```json
{
  "name": "Jane-Doe",
  "cvDir": "cv",
  "coverDir": "cover_letters",
  "sourceExt": "typ",
  "fieldSeparator": "_",
  "wordSeparator": "-"
}
```

### `.env`

Pipeline behavior:

```
BUILD_PIPELINE=full          # All 5 steps (default)
BUILD_PIPELINE=minimal       # Skip fit scoring and gap analysis
BUILD_PIPELINE=generate-only # Only generate + verify
```

## Pipeline Steps

1. **JD Parse** — Extract requirements from job description
2. **Fit Score** — Score candidate fit against profile
3. **Gap Analysis** — Identify skill gaps
4. **Generate** — Build CV + cover letter
5. **Verify** — Check page count, ATS layer, spelling

## Output

- JSON to stdout (when piping)
- Errors to stderr
- Exit code: 0 = success, 1 = error
