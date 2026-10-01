// ─── Typst Casual Cover Letter Template ─────────────────────────────────────
// Personality-forward, relaxed format for startup/creative roles.
// Shorter paragraphs, punchier structure, optional photo.

#import "../../design-system.typ": *

#let cover-letter(
  name: "",
  email: "",
  phone: "",
  linkedin: "",
  github: "",
  date: "",
  recipient: "",
  company: "",
  role: "",
  paragraphs: (),
  bullets: (),
  closing: "Best,",
  signature: "",
  photo: "",
) = {
  return (it) => {
    set page(paper: "a4", margin: (x: 2cm, y: 1.8cm))
    set text(font: body-font, size: 11pt, fill: body-color)
    set par(leading: 0.5em, justify: false)

    // ─── Header ───────────────────────────────────────────────────────────
    grid(
      columns: (1fr, auto),
      gutter: 8pt,
      align(left, {
        text(size: 28pt, weight: "bold", fill: accent)[#name]
        v(4pt)
        let items = ()
        if email != "" { items.push(email) }
        if phone != "" { items.push(phone) }
        if linkedin != "" { items.push(link(linkedin)[LinkedIn]) }
        if github != "" { items.push(link(github)[GitHub]) }
        text(size: 9.5pt, fill: meta)[#items.join([#h(4pt)•#h(4pt)])]
        v(4pt)
        if date != "" {
          text(size: 9pt, fill: meta)[#date]
        }
      }),
      align(right, {
        if photo != "" {
          circle(
            image(photo, width: 3cm, height: 3cm, fit: "cover"),
            radius: 1.5cm,
            stroke: 1pt + accent,
          )
        }
      }),
    )

    v(6pt)

    // ─── Colored accent bar ───────────────────────────────────────────────
    line(length: 100%, stroke: 3pt + accent)
    v(10pt)

    // ─── Recipient ─────────────────────────────────────────────────────────
    if recipient != "" {
      text(size: 11pt)[Hey #recipient,]
      v(8pt)
    } else {
      text(size: 11pt)[Hey there,]
      v(8pt)
    }

    // ─── Body Paragraphs ─────────────────────────────────────────────────
    for p in paragraphs {
      text(size: 11pt)[#p]
      v(6pt)
    }

    // ─── Bullet Points ───────────────────────────────────────────────────
    if bullets.len() > 0 {
      for b in bullets {
        block(inset: (x: 10pt, y: 6pt), fill: rgb("#f7f9fb"), radius: 3pt, width: 100%)[
          #text(size: 10.5pt)[#b]
        ]
        v(4pt)
      }
      v(6pt)
    }

    // ─── Closing ──────────────────────────────────────────────────────────
    text(size: 11pt)[#closing]
    v(16pt)

    if signature != "" {
      image(signature, width: 2.5cm)
      v(4pt)
    }

    text(size: 12pt, weight: "bold", fill: accent)[#name]

    it
  }
}
