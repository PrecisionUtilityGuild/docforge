#import "theme.typ": *

#let safe(value, fallback: "—") = {
  if value == none or str(value) == "" { fallback } else { value }
}

#let rag-badge(rag, compact: false) = {
  let color = rag-color(rag)
  box(
    fill: color.lighten(86%),
    stroke: 0.45pt + color.lighten(40%),
    inset: if compact { (x: 6pt, y: 3pt) } else { (x: 10pt, y: 5pt) },
    radius: 3pt,
  )[
    #text(size: if compact { 7.5pt } else { 9pt }, weight: "bold", fill: color)[#upper(rag)]
  ]
}

#let label-value(label, value) = {
  box(
    width: 100%,
    fill: white,
    stroke: 0.45pt + brand-rule,
    radius: 4pt,
    inset: (x: 10pt, y: 8pt),
  )[
    #text(size: 7.3pt, fill: brand-muted, weight: "bold", tracking: 0.55pt)[#upper(label)]
    #v(0.25em)
    #text(size: 10.2pt, weight: "semibold", fill: brand-primary)[#safe(value)]
  ]
}

#let hero(data) = {
  box(
    width: 100%,
    fill: brand-primary,
    radius: 6pt,
    inset: 18pt,
  )[
    #grid(
      columns: (1fr, auto),
      [
        #text(size: 8pt, fill: brand-rule, tracking: 0.8pt)[FORGE STATUS]
        #v(0.7em)
        #text(size: 25pt, weight: "bold", fill: white)[#data.title]
      ],
      [
        #rag-badge(data.overall_rag)
      ],
    )
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
    label-value("Prepared by", data.author),
    label-value("Overall status", upper(data.overall_rag)),
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

#let callout(title, items, tone: brand-accent) = {
  box(
    width: 100%,
    fill: tone.lighten(91%),
    stroke: 0.5pt + tone.lighten(48%),
    radius: 5pt,
    inset: 12pt,
  )[
    #text(size: 8pt, weight: "bold", fill: tone, tracking: 0.55pt)[#upper(title)]
    #v(0.45em)
    #for item in items [
      #grid(
        columns: (auto, 1fr),
        gutter: 6pt,
        text(fill: tone, weight: "bold")[->],
        text(fill: brand-primary)[#item],
      )
      #v(0.25em)
    ]
  ]
}

#let workstream-card(ws) = {
  box(
    width: 100%,
    fill: brand-surface,
    stroke: 0.45pt + brand-rule,
    radius: 5pt,
    inset: 10pt,
  )[
    #grid(
      columns: (1fr, auto),
      [
        #text(size: 11pt, weight: "bold", fill: brand-primary)[#ws.name]
        #v(0.15em)
        #text(size: 8.3pt, fill: brand-muted, weight: "semibold")[#ws.status]
      ],
      [#rag-badge(ws.rag, compact: true)],
    )
    #v(0.55em)
    #text(size: 9.2pt, fill: brand-text)[#ws.notes]
  ]
}

#let workstreams-grid(streams) = {
  grid(
    columns: (1fr, 1fr),
    gutter: 8pt,
    ..streams.map(ws => workstream-card(ws)),
  )
}

#let bullet-list(items, tone: brand-accent) = {
  for item in items [
    #grid(
      columns: (auto, 1fr),
      gutter: 6pt,
      text(fill: tone, weight: "bold")[•],
      text(fill: brand-text)[#item],
    )
    #v(0.25em)
  ]
}

#let source-audit-card(audit) = {
  let coverage = audit.coverage
  box(
    fill: white,
    stroke: 0.45pt + brand-rule,
    inset: 10pt,
    radius: 5pt,
    width: 100%,
  )[
    #grid(
      columns: (1fr, 1fr, 1fr),
      gutter: 8pt,
      label-value("Confidence", upper(audit.confidence)),
      label-value("Evidence", str(audit.evidence_count) + " snippets"),
      label-value("Sources", str(audit.sources.len())),
    )
    #v(0.6em)
    #box(width: 100%, fill: brand-surface, radius: 3pt, inset: 8pt)[
      #text(size: 8.2pt, fill: brand-muted)[Coverage: RAG #coverage.rag · blockers #coverage.blocker · next steps #coverage.next_step · workstreams #coverage.workstream]
      #if audit.warnings.len() > 0 [
        #v(0.45em)
        #text(size: 8.2pt, fill: rag-color("red").darken(5%))[
          #for warning in audit.warnings [
            - #warning
          ]
        ]
      ]
    ]
  ]
}

#let evidence-ledger(items) = {
  text(size: 8pt)[
    #table(
      columns: (auto, 0.75fr, 2.9fr),
      inset: (x: 5pt, y: 4pt),
      stroke: 0.45pt + brand-rule,
      fill: (_, y) => if y == 0 { brand-surface } else { white },
      table.header([*Signal*], [*Source*], [*Evidence*]),
      ..items
        .map(item => (
          upper(item.type.replace("_", " ")),
          item.source,
          if item.at("permalink", default: "") != "" {
            link(item.permalink)[#item.quote]
          } else {
            item.quote
          },
        ))
        .flatten(),
    )
  ]
}
