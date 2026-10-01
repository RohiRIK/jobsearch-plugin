// Deliberately overlays body text with a full-width accent rule.
#set page(paper: "a4", margin: 20mm)
#set text(size: 14pt, fill: rgb("#2c3e50"))
#place(dx: 0pt, dy: 160pt)[
  #line(length: 100%, stroke: 1pt + rgb("#1a5276"))
]
#place(dx: 12pt, dy: 153pt)[
  This text intentionally intersects the rule and must fail the visual-layout gate.
]
