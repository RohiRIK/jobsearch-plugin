// ─── Typst Cover Letter Template ────────────────────────────────────────────
// Professional cover letter with matching design system.
// Research: 1 page max, clean typography, consistent with CV.

#import "../../design-system.typ": *

#let cover-letter(
  name: "",
  email: "",
  phone: "",
  linkedin: "",
  date: "",
  recipient: "",
  company: "",
  role: "",
  paragraphs: (),
  bullets: (),
  closing: "Kind regards,",
  signature: "",
) = {
  return (it) => {
    set page(paper: "a4", margin: (x: 2.3cm, y: 2.3cm))
    set text(font: body-font, size: 11pt, fill: body-color)
    set par(leading: 0.6em, justify: false)

    // ─── Header ─────────────────────────────────────────────────────────
    align(center, {
      text(size: 24pt, weight: "bold", fill: accent)[#name]
      v(4pt)
      let items = ()
      if email != "" { items.push(email) }
      if phone != "" { items.push(phone) }
      if linkedin != "" { items.push(link(linkedin)[LinkedIn]) }
      text(size: size-meta, fill: meta)[#items.join([#h(6pt)•#h(6pt)])]
    })

    v(12pt)

    // ─── Date (right-aligned) ──────────────────────────────────────────
    align(right)[
      #text(size: size-meta, fill: meta)[#date]
    ]

    v(8pt)

    // ─── Recipient ──────────────────────────────────────────────────────
    if recipient != "" {
      text(size: 11pt)[Dear #recipient,]
      v(8pt)
    }

    // ─── Body Paragraphs ───────────────────────────────────────────────
    for p in paragraphs {
      text(size: 11pt)[#p]
      v(8pt)
    }

    // ─── Bullet Points ─────────────────────────────────────────────────
    if bullets.len() > 0 {
      for b in bullets {
        pad(left: indent-bullet)[#text(size: 11pt)[• #b]]
        v(2pt)
      }
      v(8pt)
    }

    // ─── Closing ────────────────────────────────────────────────────────
    text(size: 11pt)[#closing]
    v(24pt)

    if signature != "" {
      image(signature, width: 3cm)
      v(4pt)
    }

    text(size: 11pt, weight: "bold", fill: accent)[#name]

    it
  }
}
