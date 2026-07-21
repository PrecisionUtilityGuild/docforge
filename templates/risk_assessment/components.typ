#import "theme.typ": *

#let assessment-header(scope, assessment-date) = {
  grid(
    columns: (1fr, 1fr),
    text(size: 9pt, fill: brand-muted)[Scope: #scope],
    align(right, text(size: 9pt, fill: brand-muted)[Assessment date: #assessment-date]),
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

#let risk-score(likelihood, impact) = {
  let score = (
    if likelihood == "high" { 3 } else if likelihood == "medium" { 2 } else { 1 }
  ) * (
    if impact == "high" { 3 } else if impact == "medium" { 2 } else { 1 }
  )
  if score >= 6 { "high" } else if score >= 3 { "medium" } else { "low" }
}

#let risk-table(risks) = {
  table(
    columns: (auto, 1.2fr, auto, auto, 1fr, auto),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header(
      [*ID*],
      [*Description*],
      [*Likelihood*],
      [*Impact*],
      [*Mitigation*],
      [*Owner*],
    ),
    ..risks
      .map(r => (
        r.id,
        r.description,
        text(fill: risk-level-color(r.likelihood))[#upper(r.likelihood)],
        text(fill: risk-level-color(r.impact))[#upper(r.impact)],
        r.mitigation,
        r.owner,
      ))
      .flatten(),
  )
}
