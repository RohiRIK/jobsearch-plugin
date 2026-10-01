# build — Quick Start

## Prerequisites

- Bun installed
- Typst (`bun add typst`) — primary PDF engine
- LaTeX (optional) — fallback for `.tex` files

## First Run

```bash
# Show config
bun run scripts/build/cli.ts config

# Build a single file
bun run scripts/build/cli.ts build cv/banking/template.typ

# Build all
bun run scripts/build/cli.ts build --all
```

## Naming Convention

Documents follow: `<Name>_<Company>_<Role>_CV.pdf`

Example: `Jane-Doe_Acme_ML-Engineer_CV.pdf`

Configure in `data/config.json`.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Typst not found" | `bun add typst` |
| "File not found" | Check path, run from project root |
| "pdftotext not installed" | Install poppler (ATS check skipped) |
