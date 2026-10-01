// ─── Typst CV Template ──────────────────────────────────────────────────────
// Professional CV with design system. Research-backed:
// - F-pattern layout (eye-tracking: top-left dominance)
// - 3-level typography hierarchy (name → sections → body)
// - Generous white space (confident, not desperate)
// - Visual skill indicators (bars scan faster than text)

#import "../../design-system.typ": *

#let cv-body(
  name: "",
  lastname: "",
  contact: (),
  profile: "",
  sections: (),
  is-rtl: false,
) = {
  return (it) => {
    set page(paper: "a4", margin: (x: margin-x, y: margin-y))

    if is-rtl {
      set text(font: body-font, size: size-body, dir: rtl, fill: body-color)
    } else {
      set text(font: body-font, size: size-body, fill: body-color)
    }

    set par(leading: leading-body, justify: true)

    // ─── Name Header ────────────────────────────────────────────────────
    align(center, {
      text(size: size-name, weight: "bold", fill: accent)[#name]
      if lastname != "" [
        #h(8pt)
        #text(size: size-name, weight: "bold", fill: accent)[#lastname]
      ]
      v(6pt)
      text(size: size-meta, fill: meta)[
        #contact.join([#h(6pt)•#h(6pt)])
      ]
    })

    v(6pt)

    // ─── Profile Statement ──────────────────────────────────────────────
    if profile != "" {
      block(width: 100%, {
        text(size: size-body, style: "italic")[#profile]
      })
      v(4pt)
    }

    // ─── Sections ───────────────────────────────────────────────────────
    for s in sections {
      section-title(s.title)
      s.body
    }

    it
  }
}
