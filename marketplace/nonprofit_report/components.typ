#import "theme.typ": *

#let report-header(organization, year) = {
  grid(
    columns: (1fr, auto),
    text(size: 11pt, weight: "bold", fill: brand-accent)[#organization],
    align(right, text(size: 10pt, fill: brand-muted)[#year]),
  )
  v(0.6em)
  line(length: 100%, stroke: 0.5pt + brand-accent)
  v(0.8em)
}

#let impact-cards(metrics) = {
  grid(
    columns: (1fr, 1fr),
    gutter: 12pt,
    ..metrics.map(m => {
      box(
        width: 100%,
        fill: rgb("#f5f3ff"),
        inset: 12pt,
        radius: 4pt,
        stroke: 0.5pt + brand-accent.lighten(60%),
      )[
        #text(size: 9pt, fill: brand-muted)[#m.label]
        #v(0.2em)
        #text(size: 20pt, weight: "bold", fill: brand-accent)[#m.value]
      ]
    }),
  )
  v(1em)
}

#let programs-list(programs) = {
  for p in programs [
    #text(weight: "bold")[#p.name]
    #v(0.2em)
    #p.description
    #v(0.6em)
  ]
}

#let financials-table(financials) = {
  table(
    columns: (1.5fr, 1fr),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Category*], [*Amount*]),
    [Revenue], financials.revenue,
    [Expenses], financials.expenses,
  )
}

#let thank-you-block(message) = {
  box(
    width: 100%,
    fill: brand-accent.lighten(92%),
    inset: 14pt,
    radius: 4pt,
    stroke: 0.5pt + brand-accent.lighten(40%),
  )[
    #text(size: 11pt, style: "italic")[#message]
  ]
}
