#import "theme.typ": *
#import "docforge/charts.typ": render-charts, render-chart

#let safe(value, fallback: "—") = {
  if value == none or str(value) == "" { fallback } else { value }
}

#let label-value(label, value) = {
  box(width: 100%, fill: white, stroke: 0.45pt + brand-rule, radius: 4pt, inset: (x: 10pt, y: 8pt))[
    #text(size: 7.3pt, fill: brand-muted, weight: "bold", tracking: 0.55pt)[#upper(label)]
    #v(0.25em)
    #text(size: 10.2pt, weight: "semibold", fill: brand-primary)[#safe(value)]
  ]
}

#let hero(data) = {
  let author = data.at("author", default: "Forge")
  box(width: 100%, fill: brand-primary, radius: 6pt, inset: 18pt)[
    #text(size: 8pt, fill: brand-rule, tracking: 0.8pt)[FORGE BOARD PACK]
    #v(0.7em)
    #text(size: 25pt, weight: "bold", fill: white)[#data.title]
    #v(1em)
    #line(length: 100%, stroke: 0.6pt + brand-muted)
    #v(0.9em)
    #text(size: 11pt, fill: rgb("#eef4ff"))[#data.summary]
  ]
  v(0.85em)
  grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 8pt,
    label-value("Period", data.period),
    label-value("Prepared by", author),
    label-value("Metrics", str(data.kpis.len())),
  )
}

#let section-title(title, eyebrow: none) = {
  v(1em)
  if eyebrow != none [
    #text(size: 7.3pt, fill: brand-accent, weight: "bold", tracking: 0.65pt)[#upper(eyebrow)]
    #v(0.15em)
  ]
  text(size: 15pt, weight: "bold", fill: brand-primary)[#title]
  v(0.25em)
  line(length: 100%, stroke: 0.55pt + brand-rule)
  v(0.55em)
}

#let kpi-cards(kpis) = {
  grid(
    columns: (1fr, 1fr),
    gutter: 10pt,
    ..kpis.map(k => {
      let trend = k.at("trend", default: "flat")
      let change = k.at("change", default: "")
      box(width: 100%, fill: brand-surface, inset: 12pt, radius: 5pt, stroke: 0.45pt + brand-rule)[
        #grid(
          columns: (1fr, auto),
          text(size: 8.5pt, fill: brand-muted, weight: "semibold")[#k.name],
          text(size: 9pt, fill: trend-color(trend))[#trend-symbol(trend) #if change != "" [#text(size: 8pt)[#change]]],
        )
        #v(0.35em)
        #text(size: 20pt, weight: "bold", fill: brand-primary)[#k.value#if k.at("unit", default: "") not in ("", "$", "%") [ #text(size: 11pt, fill: brand-muted)[#k.unit]]]
        #if k.at("target", default: "") != "" [
          #v(0.35em)
          #text(size: 8pt, fill: brand-muted)[Target: #k.target]
        ]
      ]
    }),
  )
}

#let severity-chip(severity) = {
  let color = if severity == "high" { rgb("#dc2626") } else if severity == "medium" { rgb("#d97706") } else { brand-muted }
  box(fill: color.lighten(86%), stroke: 0.45pt + color.lighten(40%), inset: (x: 6pt, y: 3pt), radius: 3pt)[
    #text(size: 7.5pt, weight: "bold", fill: color)[#upper(severity)]
  ]
}

#let risk-table(risks) = {
  text(size: 8.6pt)[
    #table(
      columns: (2.4fr, auto, 2fr),
      inset: (x: 7pt, y: 5pt),
      stroke: 0.45pt + brand-rule,
      fill: (_, y) => if y == 0 { brand-surface } else { white },
      align: (left, center, left),
      table.header([*Risk*], [*Severity*], [*Mitigation*]),
      ..risks
        .map(r => (
          r.description,
          severity-chip(r.at("severity", default: "medium")),
          r.at("mitigation", default: "—"),
        ))
        .flatten(),
    )
  ]
}

#let ask-table(asks) = {
  text(size: 8.6pt)[
    #table(
      columns: (2.2fr, 1fr, 1fr),
      inset: (x: 7pt, y: 5pt),
      stroke: 0.45pt + brand-rule,
      fill: (_, y) => if y == 0 { brand-surface } else { white },
      table.header([*Ask*], [*Owner*], [*Due*]),
      ..asks
        .map(a => (a.title, a.at("owner", default: "—"), a.at("due", default: "—")))
        .flatten(),
    )
  ]
}
