#import "theme.typ": *
#import "docforge/charts.typ": render-charts

#let report-header(period, author) = {
  grid(
    columns: (1fr, 1fr),
    text(fill: brand-muted, size: 10pt)[Period: #period],
    align(right, text(fill: brand-muted, size: 10pt)[#author]),
  )
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
        #text(size: 9pt, fill: brand-muted)[#m.name]
        #v(0.2em)
        #text(size: 18pt, weight: "bold")[#m.value#if m.at("unit", default: "") != "" [ #m.unit]]
        #v(0.2em)
        #text(size: 8pt, fill: trend-color(m.at("trend", default: "flat")))[
          #trend-symbol(m.at("trend", default: "flat"))
        ]
        #if m.at("target", default: "") != "" [
          #v(0.1em)
          #text(size: 8pt, fill: brand-muted)[Target: #m.target]
        ]
      ]
    }),
  )
  v(1em)
}
