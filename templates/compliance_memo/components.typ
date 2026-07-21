#import "theme.typ": *

#let compliance-header(regulation, effective-date) = {
  grid(
    columns: (1fr, 1fr),
    text(size: 9pt, fill: brand-muted)[Regulation: #regulation],
    align(right, text(size: 9pt, fill: brand-muted)[Effective: #effective-date]),
  )
  v(0.4em)
  line(length: 100%, stroke: 0.5pt + brand-accent)
  v(0.8em)
}

#let summary-block(body) = {
  block(
    fill: rgb("#f8fafc"),
    inset: 12pt,
    radius: 4pt,
    width: 100%,
  )[
    #text(weight: "bold", fill: brand-primary)[Summary]
    #v(0.3em)
    #body
  ]
  v(1em)
}

#let requirements-block(items) = {
  for item in items [
    - #item
  ]
}

#let action-table(items) = {
  table(
    columns: (1.5fr, 1fr, 1fr, auto),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Action*], [*Owner*], [*Due*], [*Status*]),
    ..items
      .map(a => (
        a.title,
        a.at("owner", default: "—"),
        a.at("due", default: "—"),
        upper(a.at("status", default: "open").replace("_", " ")),
      ))
      .flatten(),
  )
}
