#import "theme.typ": *

#let contract-header(effective-date) = {
  align(right, text(size: 9pt, fill: brand-muted)[Effective: #effective-date])
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

#let parties-table(parties) = {
  table(
    columns: (1.5fr, 1fr),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Party*], [*Role*]),
    ..parties.map(p => (p.name, p.role)).flatten(),
  )
}

#let clause-block(clause) = [
  #metadata((type: "section", title: clause.title, empty: clause.body == ""))
  <lint-section>
  #text(size: 13pt, weight: "bold", fill: brand-primary)[#clause.title]
  #v(0.3em)
  #clause.body
  #v(0.8em)
]

#let key-dates-table(dates) = {
  table(
    columns: (1.5fr, 1fr),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Milestone*], [*Date*]),
    ..dates.map(d => (d.label, d.date)).flatten(),
  )
}
