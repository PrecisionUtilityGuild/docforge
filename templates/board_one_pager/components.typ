#import "theme.typ": *

#let board-header(period) = {
  align(right, text(size: 9pt, fill: brand-muted)[Period: #period])
  v(0.4em)
  line(length: 100%, stroke: 0.5pt + brand-accent)
  v(0.8em)
}

#let metric-cards(metrics) = {
  grid(
    columns: (1fr, 1fr),
    gutter: 12pt,
    ..metrics.map(m => {
      box(
        width: 100%,
        fill: rgb("#f0fdf4"),
        inset: 12pt,
        radius: 4pt,
        stroke: 0.5pt + brand-accent.lighten(60%),
      )[
        #text(size: 9pt, fill: brand-muted)[#m.label]
        #v(0.2em)
        #text(size: 18pt, weight: "bold")[#m.value]
        #v(0.2em)
        #text(size: 8pt, fill: trend-color(m.trend))[#trend-symbol(m.trend)]
      ]
    }),
  )
  v(1em)
}

#let highlights-block(items) = {
  for item in items [
    - #item
  ]
}

#let ask-table(asks) = {
  table(
    columns: (1.5fr, 1fr, 1fr),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Ask*], [*Owner*], [*Due*]),
    ..asks
      .map(a => (
        a.title,
        a.at("owner", default: "—"),
        a.at("due", default: "—"),
      ))
      .flatten(),
  )
}
