# Templates

This folder holds document templates — both shipped Typst templates and user-registered LaTeX templates.

## Shipped Typst Templates

The project ships built-in Typst templates that compile against `design-system.typ` (shared tokens for fonts, colors, spacing):

### CV Templates (`cv/`)

| Template | Style | Description |
|:---------|:------|:------------|
| `banking` | Typst | Formal, conservative single-column wrapper. |
| `modern` | Typst | Modern ATS-first single column with literal contact text, plain skill labels, and reliable page breaks. |
| `academic` | Stub | Metadata only; hidden from available-template listings until `template.typ` exists. |
| `creative` | Stub | Metadata only; hidden from available-template listings until `template.typ` exists. |

### Cover Letter Templates (`cover/`)

| Template | Style | Description |
|:---------|:------|:------------|
| `classic` | Typst | Traditional formal cover letter with ragged-right body text. |
| `modern` | Typst | Semi-formal, direct opener. Matches the modern CV design system — same accent, fonts, clean sans-serif. |
| `casual` | Typst | Personality-forward, relaxed format for startup/creative roles. Shorter paragraphs, punchier structure, optional photo. |

### Portfolio Templates (`portfolio/`)

HTML portfolio templates used by `bun run portfolio` (profile → static HTML). These are TypeScript modules, not Typst:

| Template | Style | Description |
|:---------|:------|:------------|
| `minimal` | HTML | System-ui, monochrome ink-on-paper, generous whitespace. Light/dark themes. |
| `modern` | HTML | Inter + JetBrains Mono, OKLCH slate-indigo with amber accent, sharp 2px stance. Light/dark themes. |
| `terminal` | HTML | Monospace green-on-black retro CLI aesthetic, blinking cursor, box-drawing sections. Dark-only. |

## User-Registered Templates

This folder also holds user-registered LaTeX templates, managed by the `/add-template` command. The framework works out of the box with its stock templates (moderncv for CVs, `cover.cls` for cover letters) — this folder only gets additional content when you register your own.

### Layout

```
templates/
├── cv/
│   └── <template-name>/
│       ├── template.tex     # Profile-agnostic skeleton ([PLACEHOLDER] tokens)
│       ├── TEMPLATE.md      # Manifest: engine, fonts, page limit, style rules, pitfalls
│       ├── *.cls / *.sty    # Custom class/style files (if the template needs them)
│       └── fonts/           # Bundled font files (if not using system fonts)
└── cover/
    └── <template-name>/
        └── (same layout)
```

### How it works

- `/add-template` interviews you for the template's instructions (compile engine, fonts, style rules, page limit), stores the files here, and runs a mandatory test compile before registering anything.
- Activating a template makes it available to the shared application render workflow and its template-selection step.
- `/add-template --list` shows registered templates; `/add-template --use <name>` switches; `/add-template --use default` reverts to the stock templates.

Templates are stored with `[PLACEHOLDER]` tokens instead of personal data, so they are safe to commit and share.
