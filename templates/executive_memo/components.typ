#import "theme.typ": *

#let memo-header(author, date) = {
  grid(
    columns: (1fr, 1fr),
    text(fill: brand-muted, size: 9pt)[#author],
    align(right, text(fill: brand-muted, size: 9pt)[#date]),
  )
  v(0.4em)
  line(length: 100%, stroke: 0.5pt + brand-accent)
  v(0.8em)
}

#let memo-summary(body) = {
  block(
    fill: rgb("#f8fafc"),
    inset: 12pt,
    radius: 4pt,
    width: 100%,
  )[
    #text(weight: "bold", fill: brand-primary)[Executive Summary]
    #v(0.3em)
    #body
  ]
  v(1em)
}

#let section-block(title, body) = [
  #metadata((type: "section", title: title, empty: body == ""))
  <lint-section>
  #metadata((type: "todo_placeholder", found: body.contains("TODO") or body.contains("TBD")))
  <lint-todo>
  #text(size: 14pt, weight: "bold", fill: brand-primary)[#title]
  #v(0.3em)
  #body
  #v(0.8em)
]

#let risk-table(risks) = {
  table(
    columns: (1fr, auto, 1fr),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Risk*], [*Severity*], [*Mitigation*]),
    ..risks
      .map(r => (
        r.description,
        r.at("severity", default: "medium"),
        r.at("mitigation", default: "—"),
      ))
      .flatten(),
  )
}

#let action-table(actions) = {
  table(
    columns: (1.5fr, 1fr, 1fr),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Action*], [*Owner*], [*Due*]),
    ..actions
      .map(a => (
        a.title,
        a.at("owner", default: "—"),
        a.at("due", default: "—"),
      ))
      .flatten(),
  )
}
