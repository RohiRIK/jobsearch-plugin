# Spec: Document Generation & Data Pipeline Overhaul

## What

Replace the fragile LaTeX-only PDF pipeline and flat CSV tracker with a resilient, multi-format document generation system and a crash-safe SQLite data store. The goal: every output (CV, cover letter, salary report, upskill report) compiles reliably, validates automatically, and degrades gracefully. Data is typed, validated, and safe from corruption.

## Existing Context

### Files involved
- `assets/cv/main_example.tex` — moderncv banking style CV template (LaTeX)
- `assets/cover_letters/cover.cls` — custom cover letter class (Lato/Raleway fonts)
- `assets/cover_letters/OpenFonts/fonts/` — bundled font directory
- `.claude/skills/job-application-assistant/05-cv-templates.md` — CV compile instructions
- `.claude/skills/job-application-assistant/06-cover-letter-templates.md` — cover letter compile instructions
- `.claude/commands/apply.md` — main application workflow
- `job_search_tracker.csv` — CSV tracker (header-only, no data rows)
- `.agents/skills/job-scraper/SKILL.md` — scraper writes `job_scraper/seen_jobs.json`

### Current problems
1. **No LaTeX installed** — entire pipeline is non-functional on this machine
2. **Two different engines** — lualatex for CV, xelatex for cover letters, no unified command
3. **Manual everything** — compile, page-count check, ATS verification, orphan detection all done by hand
4. **LaTeX is fragile** — single missing brace prevents any output, no partial compilation, cryptic errors
5. **No Hebrew/RTL support** — user is in Israel, needs bilingual CVs
6. **CSV is fragile** — no schema enforcement, free-text status, no unique ID, corrupts on partial write
7. **No dedup link** — `seen_jobs.json` (scraper) and `job_search_tracker.csv` (applications) can't reliably cross-reference
8. **ATS is unreliable** — DOCX is parsed 95-100% across ATS platforms; PDF is 80-98%

### Research findings
- **Typst**: Single binary (<50MB), compiles in 50-100ms, native RTL/Hebrew, tagged PDF for ATS, TypeScript integration via `npm:typst`
- **bun:sqlite**: Built into Bun, crash-safe WAL mode, typed columns, UNIQUE constraints, zero npm deps
- **Zod v4**: Schema-first validation, TypeScript type inference, rich error messages
- **DOCX**: Most reliably parsed ATS format — should be generated alongside PDF
- **HTML→Playwright**: Alternative PDF path for CSS-heavy layouts, but adds 600-900MB dependency

## Architecture Decision

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Primary PDF engine** | Typst | <50MB install, 50ms compile, native RTL, tagged PDF, TS integration |
| **LaTeX fallback** | Keep .tex templates | For users who already have LaTeX installed, or need legacy templates |
| **ATS export** | DOCX via `docx` lib | 95-100% ATS parse rate, ~2MB, pure TS |
| **Data store** | `bun:sqlite` | Built-in, crash-safe, typed, zero deps |
| **Validation** | Zod v4 | Schema-first, type inference, ~2KB |
| **Dedup** | URL norm + SHA-256 hash | Deterministic, no fuzzy matching needed for <1000 entries |
| **File I/O** | Atomic writes (temp + rename) | Prevents corruption on crash |

## Acceptance Criteria

### 1. Document Build CLI (`scripts/build.ts`)

Unified entry point for all document generation. Detects input format, picks the right engine, validates output.

```bash
bun run scripts/build.ts assets/cv/main.typ                        # Typst → PDF
bun run scripts/build.ts assets/cv/main_<company>.tex              # LaTeX → PDF (fallback)
bun run scripts/build.ts assets/cover_letters/cover.typ            # Typst → PDF
bun run scripts/build.ts --all                              # Build everything
bun run scripts/build.ts --format docx assets/cv/main.typ          # Typst → PDF + DOCX
bun run scripts/build.ts --verify                           # Verify existing PDFs only
```

- [ ] Given a `.typ` file, when built, then `typst compile <input> <output>` is invoked and a PDF is produced
- [ ] Given a `.tex` file, when built, then the correct engine is auto-detected: `lualatex` if `\documentclass.*moderncv`, `xelatex` if `\documentclass.*cover`
- [ ] Given a successful build, when the PDF exists, then the page count is extracted and validated: CV = exactly 2, cover letter = exactly 1
- [ ] Given a page-count mismatch, when validation fails, then a clear error is printed with expected vs actual count and the tool exits non-zero
- [ ] Given `--format docx`, when invoked, then a DOCX variant is generated alongside the PDF using the `docx` library
- [ ] Given the build produces no output (compile error), when the engine fails, then the last 10 lines of error output are printed and the tool exits non-zero
- [ ] Given `--all`, when invoked, then every `.typ` and `.tex` in `assets/cv/` and `assets/cover_letters/` is compiled and a summary table is printed: file | engine | pages | status | ats_check
- [ ] Given `--verify`, when invoked, then existing PDFs are checked (page count, text extraction) without recompiling

### 2. ATS Verification (`scripts/verify-ats.ts`)

Post-build check that validates ATS parseability of generated PDFs.

```bash
bun run scripts/verify-ats.ts assets/cv/main_<company>.pdf
bun run scripts/verify-ats.ts --all                         # Verify all PDFs in assets/cv/ and assets/cover_letters/
```

- [ ] Given a PDF, when verified, then the text layer is extracted (via `pdftotext` if available, or a bundled TS PDF parser)
- [ ] Given extracted text, when checking a CV, then it verifies: no `(cid:*)` markers, no `�` replacement characters, email appears as literal text
- [ ] Given extracted text, when checking a cover letter, then it verifies: signature block present, no garbled output
- [ ] Given `pdftotext` is not available, when verifying, then a warning is printed and the check is skipped (not a failure)
- [ ] Given a failed check, when verification exits, then the exit code is non-zero
- [ ] Given `--all`, when invoked, then a summary table is printed: file | pages | text_clean | email_literal | status

### 3. Typst CV Template (`assets/cv/template.typ`)

A Typst-native CV template matching the current moderncv banking style, with Hebrew/RTL support.

- [ ] Given the Typst template, when compiled, then it produces a 2-page CV with the same visual structure as the current moderncv banking style (name header, sections, bullet points,蓝色 accents)
- [ ] Given Hebrew text in the template, when compiled with `dir: rtl`, then RTL text renders correctly alongside LTR content (bilingual CV)
- [ ] Given the template, when compiled, then the PDF text layer is linear and ordered (no interleaving, no garbled output)
- [ ] Given the template, when fonts are specified via `#set text(font: "...")`, then bundled fonts in `assets/cover_letters/OpenFonts/` resolve correctly
- [ ] Given a CV entry, when `\needspace` equivalent is needed, then Typst's `#block(breakable: false)` prevents orphaned entries
- [ ] Given the template, when compiled with `typst compile`, then it completes in under 200ms

### 4. Typst Cover Letter Template (`assets/cover_letters/template.typ`)

A Typst-native cover letter template matching the current cover.cls style.

- [ ] Given the Typst template, when compiled, then it produces a 1-page cover letter with Lato/Raleway fonts
- [ ] Given the template, when compiled, then the signature block fits at the bottom without overflow
- [ ] Given bullet lists in the template, when rendered, then the font matches the body text (no mismatch)
- [ ] Given the template, when compiled with `typst compile`, then it completes in under 200ms

### 5. SQLite Data Store (`data/tracker.db`)

Replace `job_search_tracker.csv` with a SQLite database. Keep CSV as an import/export format.

```bash
bun run scripts/tracker.ts list                             # List all applications
bun run scripts/tracker.ts add --company "Acme" --role "ML Engineer" --source "https://..."
bun run scripts/tracker.ts update <id> --status interviewing
bun run scripts/tracker.ts import job_search_tracker.csv    # One-time CSV import
bun run scripts/tracker.ts export --format csv              # Export for external tools
```

- [ ] Given `tracker.db` is created, when the schema is initialized, then it has columns: id (TEXT PK), date (TEXT), company (TEXT), sector (TEXT), role (TEXT), role_type (TEXT), channel (TEXT), status (TEXT CHECK), contact_person (TEXT), fit_rating (INTEGER CHECK 0-100), notes (TEXT), cv_file (TEXT), cover_letter_file (TEXT), source (TEXT), content_hash (TEXT UNIQUE), created_at (TEXT), updated_at (TEXT)
- [ ] Given a new row is inserted, when `id` is auto-generated, then it follows format `app_YYYYMMDD_<company_slug>`
- [ ] Given a new row is inserted, when `status` is set, then it accepts only: `planning`, `applied`, `interviewing`, `offered`, `rejected`, `withdrawn`, `no_response`
- [ ] Given a new row is inserted, when `source` is a URL, then `content_hash` is computed as `SHA-256(normalized_title + company.toLowerCase() + location)` and stored
- [ ] Given a row with the same `content_hash` already exists, when inserting, then `INSERT OR IGNORE` prevents duplicate entries
- [ ] Given a row is updated, when the update completes, then `updated_at` is set to the current ISO timestamp
- [ ] Given `import job_search_tracker.csv`, when the CSV has rows, then each row is validated against the schema before insert, and invalid rows are logged (not silently dropped)
- [ ] Given `export --format csv`, when invoked, then the current database is exported to a CSV file with the same column structure as the original `job_search_tracker.csv`
- [ ] Given the database file is corrupted, when opened, then SQLite's WAL journal recovers the last consistent state

### 6. Zod Schemas (`data/schemas.ts`)

Shared validation schemas for all data flowing through the pipeline.

- [ ] Given a `JobApplication` schema, when defined, then it includes all tracker columns with correct types and constraints
- [ ] Given a `JobApplication` schema, when `.parse()` is called with invalid data, then it throws a ZodError with field-level error messages
- [ ] Given a `JobApplication` schema, when `.safeParse()` is called, then it returns `{ success: true, data }` or `{ success: false, errors }`
- [ ] Given a `SeenJob` schema, when defined, then it validates the `seen_jobs.json` structure: `{ seen: Record<string, { title, company, location, market, url, first_seen, fit, status }> }`
- [ ] Given a `CompileResult` schema, when defined, then it validates the build output: `{ file, engine, pages, status, ats_check, error? }`
- [ ] Given schemas are exported, when imported by `scripts/build.ts` and `scripts/tracker.ts`, then both tools share the same type definitions

### 7. Resilience Patterns

- [ ] Given any file write (DB, PDF, JSON), when writing, then the pattern is: write to temp path → fsync → rename to final path (atomic write)
- [ ] Given a build fails mid-compilation, when the error is caught, then the last good PDF is preserved (no overwrite with broken output)
- [ ] Given a CSV import encounters invalid rows, when processing, then valid rows are inserted and invalid rows are logged to `import-errors.log` (partial success)
- [ ] Given `seen_jobs.json` is updated, when the update completes, then the file is written atomically (no corruption on Ctrl+C)
- [ ] Given the database is queried, when the query fails, then a clear error is returned (not a stack trace)

### 8. Template Selection & Reasoning (`scripts/select-template.ts`)

When `/apply` runs, the system must reason about which CV/cover-letter template best fits the target job. Different jobs need different styles — a creative agency in Tel Aviv wants a different look than a bank in Copenhagen or a tech startup in the US.

```bash
bun run scripts/select-template.ts --job posting.md --profile 01-candidate-profile.md
# Output: { cv: "banking", cover: "classic", rationale: "..." }
```

**Template metadata** — each template declares what it's suitable for:

```typescript
// assets/cv/templates/banking/meta.json
{
  "name": "banking",
  "engine": "typst",           // or "latex"
  "source": "template.typ",
  "formality": "formal",       // formal | semi-formal | casual
  "sectors": ["finance", "consulting", "legal", "enterprise"],
  "markets": ["dk", "us", "eu"],  // where this style is conventional
  "style": "conservative",     // conservative | modern | creative
  "pages": 2,
  "features": ["rtl_support", "bullet_lists", "section_ordering"],
  "description": "Clean, professional. Safe default for corporate roles."
}
```

- [ ] Given a `templates/` directory, when templates are registered, then each has a `meta.json` with: name, engine, source, formality, sectors, markets, style, features
- [ ] Given a job posting, when analyzed, then signals are extracted: industry/sector, formality level (language cues), market/country, company size cues, role type (technical/creative/management)
- [ ] Given extracted signals and template metadata, when matching, then a relevance score is computed: sector match (0-1), formality match (0-1), market match (0-1), feature coverage (0-1)
- [ ] Given multiple templates score above threshold, when ranking, then the highest-scoring template is selected and the rationale is recorded
- [ ] Given no template scores above 0.5, when falling back, then the default `banking` template is used with a note that no strong match was found
- [ ] Given the selected template, when passed to the build CLI, then the correct engine and source file are used
- [ ] Given the `/apply` workflow, when Step 2 (Tailor CV) runs, then `select-template.ts` is invoked before writing the `.typ`/`.tex` file, and the chosen template + rationale are stored in the tracker row's `notes` column
- [ ] Given a template is selected, when the user disagrees, then they can override with `--template <name>` and the override is recorded

**Job posting signal extraction** (runs inside the reasoning step):

| Signal | How extracted | Used for |
|--------|--------------|----------|
| **Sector** | Company name → web search, or posting mentions "fintech", "healthcare", etc. | `sectors` match |
| **Formality** | Language cues: "Dear Hiring Manager" = formal, "Hey team" = casual | `formality` match |
| **Market** | Domain (.dk = Denmark, .co.il = Israel), posting language, location field | `markets` match |
| **Role type** | Title keywords: "engineer" = technical, "designer" = creative, "manager" = leadership | `features` match (e.g., creative templates for designers) |
| **Company size** | Startup cues ("fast-paced", "wear many hats") vs enterprise (" Fortune 500", "established") | `style` match |

**Template variants to create:**

| Template | Formality | Sectors | Markets | Style |
|----------|-----------|---------|---------|-------|
| `banking` | formal | finance, consulting, legal | dk, us, eu | conservative |
| `modern` | semi-formal | tech, startup, data | us, il, eu | modern |
| `creative` | casual | design, marketing, media | il, us | creative |
| `academic` | formal | research, university, pharma | dk, us, eu | conservative |

### 8a. Template CLI (`scripts/templates.ts`)

Manage the template library.

```bash
bun run scripts/templates.ts list                          # List all templates with metadata
bun run scripts/templates.ts info banking                  # Show full metadata for a template
bun run scripts/templates.ts match --job posting.md        # Score all templates against a posting
```

- [ ] Given `list`, when invoked, then all templates are displayed in a table: name | formality | sectors | markets | style
- [ ] Given `info <name>`, when invoked, then the full `meta.json` is printed with the template's description
- [ ] Given `match --job <file>`, when invoked, then all templates are scored against the posting and results are ranked: template | score | rationale

### 9. Asset Management (`assets/`)

Templates reference images — profile photos, company logos, icons, signatures. The pipeline needs a clean way to manage these without hardcoding paths.

**Asset directory structure:**

```
assets/
├── photos/
│   └── profile.jpg            # User's profile photo (cropped, consistent)
├── logos/
│   └── <company>.png          # Company logos (downloaded per application)
├── icons/
│   ├── email.svg
│   ├── phone.svg
│   ├── linkedin.svg
│   ├── github.svg
│   └── location.svg
├── signatures/
│   └── signature.png          # Handwritten signature scan
└── fonts/
    └── OpenFonts/             # Already exists at assets/cover_letters/OpenFonts/
```

**Template metadata — asset declarations:**

```typescript
// templates/cv/banking/meta.json
{
  "name": "banking",
  ...
  "assets": {
    "photo": { "required": false, "position": "top-right", "size": "2.5cm" },
    "icons": { "required": false, "style": "font-awesome" }
  }
}

// templates/cv/creative/meta.json
{
  "name": "creative",
  ...
  "assets": {
    "photo": { "required": true, "position": "left-sidebar", "size": "3cm" },
    "icons": { "required": true, "style": "custom-svg" },
    "logo": { "required": false, "position": "header" }
  }
}
```

**Schema — asset types:**

```typescript
// data/schemas.ts
const AssetConfig = z.object({
  photo: z.object({
    required: z.boolean(),
    position: z.enum(["top-left", "top-right", "left-sidebar", "none"]),
    size: z.string(),  // "2.5cm", "3cm", etc.
  }).optional(),
  icons: z.object({
    required: z.boolean(),
    style: z.enum(["font-awesome", "custom-svg", "none"]),
  }).optional(),
  logo: z.object({
    required: z.boolean(),
    position: z.enum(["header", "sidebar", "none"]),
  }).optional(),
  signature: z.object({
    required: z.boolean(),
  }).optional(),
})
```

**Acceptance criteria:**

- [ ] Given `assets/` exists, when templates reference images, then paths are resolved relative to the project root (not hardcoded to one user's machine)
- [ ] Given a profile photo exists at `assets/photos/profile.jpg`, when a template with `photo.required: true` is selected, then the photo is embedded in the generated CV
- [ ] Given a profile photo does NOT exist, when a template with `photo.required: true` is selected, then the build CLI warns and falls back to a template with `photo.required: false`
- [ ] Given a template declares `icons.style: "custom-svg"`, when the CV is built, then SVG icons from `assets/icons/` are embedded (Typst: `image("assets/icons/email.svg")`)
- [ ] Given a template declares `icons.style: "font-awesome"`, when the CV is built, then fontawesome glyphs are used (LaTeX: `\faIcon{envelope}`, Typst: use Typst Universe icon packages)
- [ ] Given a signature image exists at `assets/signatures/signature.png`, when a cover letter is built, then the signature is placed below the closing line
- [ ] Given a company logo is requested, when building a cover letter, then the logo is downloaded from the company's website (via WebFetch) and saved to `assets/logos/<company>.png`
- [ ] Given any asset file is missing, when the build runs, then the build succeeds without the missing asset (graceful degradation) and a warning is printed
- [ ] Given assets are generated (logos, downloaded images), when saved, then they are written atomically and tracked in a `.assets-manifest.json` for cache invalidation
- [ ] Given `assets/` contents, when `.gitignore` is checked, then `assets/photos/`, `assets/signatures/`, and `assets/logos/` are gitignored (personal/ ephemeral), but `assets/icons/` and `assets/fonts/` are tracked

**Asset resolution order:**

```
1. Check assets/photos/profile.jpg (user's photo)
2. Check assets/logos/<company>.png (company logo)
3. Check assets/icons/*.svg (icon set)
4. Check assets/cover_letters/OpenFonts/ (fonts — already exists)
5. If required asset missing → warn + fallback template
```

**Market-specific photo rules:**

| Market | Photo expected? | Action |
|--------|----------------|--------|
| Israel (`.co.il`) | Yes — standard | Use photo if available, warn if missing |
| Denmark (`.dk`) | No — discouraged | Skip photo, note in template metadata |
| US (`.com`, `.io`) | No — discouraged | Skip photo |
| EU (generic) | Varies | Use photo if available |

The template selection engine (`select-template.ts`) considers photo availability when scoring: if no photo exists and the market expects one, the score for photo-requiring templates is penalized.

## Out of Scope

- Installing Typst or LaTeX on the machine (documented in README)
- Auto-fixing orphaned entries (the tool detects and reports, but fixing requires editing the source)
- PDF post-processing (merging, signing, watermarking)
- Cover letter content generation (that's the apply command's job)
- HTML→PDF via Playwright (too heavy for this project — Typst covers the same ground)
- Web preview server (nice-to-have, not in this iteration)
- CI/CD pipeline (GitHub Actions for automated builds — separate concern)

## Implementation Notes

### Directory structure
```
scripts/
├── build.ts              # Unified build CLI (Typst + LaTeX)
├── verify-ats.ts         # ATS text-layer verification
├── tracker.ts            # SQLite tracker CLI
├── select-template.ts    # Template reasoning & selection
├── templates.ts          # Template library management
└── schemas.ts            # Zod schemas (or data/schemas.ts)
data/
├── tracker.db            # SQLite database (gitignored)
└── schemas.ts            # Zod schemas
assets/
├── photos/
│   └── profile.jpg       # User's photo (gitignored)
├── logos/
│   └── <company>.png     # Company logos (gitignored, ephemeral)
├── icons/
│   ├── email.svg         # Custom icon set (tracked)
│   ├── phone.svg
│   ├── linkedin.svg
│   ├── github.svg
│   └── location.svg
├── signatures/
│   └── signature.png     # Handwritten signature (gitignored)
└── fonts/
    └── OpenFonts/        # Bundled fonts (tracked, already exists)
templates/
├── assets/cv/
│   ├── banking/
│   │   ├── meta.json     # Template metadata (includes asset config)
│   │   └── template.typ  # Typst source
│   ├── modern/
│   │   ├── meta.json
│   │   └── template.typ
│   ├── creative/
│   │   ├── meta.json
│   │   └── template.typ
│   └── academic/
│       ├── meta.json
│       └── template.typ
└── cover/
    ├── classic/
    │   ├── meta.json
    │   └── template.typ
    ├── modern/
    │   ├── meta.json
    │   └── template.typ
    └── casual/
        ├── meta.json
        └── template.typ
assets/cv/
├── main_example.tex      # Keep existing LaTeX template
├── main_<company>.tex    # Generated per application (LaTeX fallback)
└── main_<company>.typ    # Generated per application (Typst primary)
assets/cover_letters/
├── cover.cls             # Keep existing LaTeX class
├── cover_<company>_<role>.tex
└── cover_<company>_<role>.typ
```

### Dependency impact
| Add | Size | Deps |
|-----|------|------|
| `typst` (npm) | ~5MB (wraps binary) | 0 |
| `zod` | ~2KB | 0 |
| `docx` | ~2MB | 0 |
| `bun:sqlite` | 0 (built-in) | 0 |

Net new npm dependencies: **3** (typst, zod, docx). All zero-dep.

### Migration path
1. Install Typst: `bun install typst` (npm wrapper for binary)
2. Create `data/schemas.ts` with Zod schemas
3. Create `scripts/tracker.ts` with SQLite CLI
4. Create one-time CSV → SQLite import script
5. Create `scripts/build.ts` with Typst primary + LaTeX fallback
6. Create `templates/cv/banking/meta.json` + `template.typ` (first template)
7. Create `scripts/select-template.ts` with template matching logic
8. Create `scripts/templates.ts` for template library management
9. Create `templates/cv/modern/`, `templates/cv/creative/`, `templates/cv/academic/` metadata
10. Create `templates/cover/classic/`, `templates/cover/modern/`, `templates/cover/casual/` metadata
11. Create `scripts/verify-ats.ts`
12. Update `.claude/skills/job-application-assistant/05-cv-templates.md` and `06-cover-letter-templates.md`
13. Update `.claude/commands/apply.md` to use build CLI, template selection, and SQLite tracker
14. Update `.claude/skills/job-scraper/SKILL.md` to write to SQLite instead of CSV

### LaTeX coexistence
During migration, both LaTeX and Typst paths are supported. The build CLI auto-detects the engine from the file extension (`.tex` → LaTeX, `.typ` → Typst). Existing `.tex` templates continue to work. Typst becomes the default for new templates.
