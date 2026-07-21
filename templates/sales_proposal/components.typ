#import "theme.typ": *

#let safe(value, fallback: "—") = {
  if value == none or str(value) == "" { fallback } else { value }
}

#let label_value(label, value) = {
  box(
    width: 100%,
    fill: white,
    stroke: 0.45pt + brand-rule,
    radius: 3pt,
    inset: (x: 9pt, y: 7pt),
  )[
    #text(size: 7.5pt, fill: brand-muted, tracking: 0.4pt)[#upper(label)]
    #v(0.25em)
    #text(size: 10.5pt, weight: "semibold", fill: brand-primary)[#safe(value)]
  ]
}

#let proposal_hero(data) = {
  block(
    width: 100%,
    fill: brand-primary,
    radius: 6pt,
    inset: 18pt,
  )[
    #grid(
      columns: (1fr, auto),
      [
        #text(size: 8pt, fill: brand-rule, tracking: 0.8pt)[FORGE PROPOSAL]
        #v(0.8em)
        #text(size: 25pt, weight: "bold", fill: white)[#data.title]
      ],
      [
        #box(
          fill: brand-accent,
          radius: 3pt,
          inset: (x: 8pt, y: 4pt),
        )[
          #text(size: 8pt, fill: white, weight: "bold")[READY FOR REVIEW]
        ]
      ],
    )
    #v(1em)
    #line(length: 100%, stroke: 0.6pt + brand-muted)
    #v(1em)
    #text(size: 11pt, fill: rgb("#eef4ff"))[#data.executive_summary]
  ]
  v(0.9em)
  grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 8pt,
    label_value("Client", data.client.name),
    label_value("Date", data.at("date", default: "")),
    label_value("Investment", data.pricing.total),
  )
}

#let section_title(title, eyebrow: none) = {
  v(1.1em)
  if eyebrow != none [
    #text(size: 7.5pt, fill: brand-accent, weight: "bold", tracking: 0.7pt)[#upper(eyebrow)]
    #v(0.15em)
  ]
  text(size: 15pt, weight: "bold", fill: brand-primary)[#title]
  v(0.25em)
  line(length: 100%, stroke: 0.55pt + brand-rule)
  v(0.55em)
}

#let scope_list(items) = {
  grid(
    columns: (1fr, 1fr),
    gutter: 8pt,
    ..items.enumerate().map(pair => {
      let index = pair.at(0) + 1
      let item = pair.at(1)
      box(
        width: 100%,
        fill: brand-surface,
        stroke: 0.45pt + brand-rule,
        radius: 4pt,
        inset: 10pt,
      )[
        #text(size: 8pt, fill: brand-accent, weight: "bold")[#if index < 10 { "0" + str(index) } else { str(index) }]
        #v(0.35em)
        #text(size: 10.5pt, weight: "semibold", fill: brand-primary)[#item.item]
        #if item.at("notes", default: "") != "" [
          #v(0.35em)
          #text(size: 9pt, fill: brand-muted)[#item.notes]
        ]
      ]
    }),
  )
}

#let timeline_table(rows) = {
  table(
    columns: (1.05fr, 0.75fr, 1.7fr),
    inset: (x: 8pt, y: 7pt),
    stroke: 0.45pt + brand-rule,
    fill: (_, y) => if y == 0 { brand-primary } else { white },
    table.header(
      text(fill: white, weight: "bold")[Phase],
      text(fill: white, weight: "bold")[Duration],
      text(fill: white, weight: "bold")[Deliverables],
    ),
    ..rows
      .map(r => (
        text(weight: "semibold", fill: brand-primary)[#r.phase],
        r.duration,
        r.at("deliverables", default: "—"),
      ))
      .flatten(),
  )
}

#let pricing_table(pricing) = {
  box(
    width: 100%,
    stroke: 0.55pt + brand-rule,
    radius: 5pt,
    inset: 0pt,
  )[
    #table(
      columns: (1fr, auto),
      inset: (x: 10pt, y: 8pt),
      stroke: (x, y) => if y == 0 { 0pt } else { 0.35pt + brand-rule },
      table.header(
        text(size: 8pt, fill: brand-muted, weight: "bold", tracking: 0.5pt)[ITEM],
        text(size: 8pt, fill: brand-muted, weight: "bold", tracking: 0.5pt)[AMOUNT],
      ),
      ..pricing.line_items
        .map(li => (
          text(fill: brand-primary)[#li.item],
          align(right)[#text(weight: "semibold")[#li.amount]],
        ))
        .flatten(),
    )
    #box(
      width: 100%,
      fill: brand-primary,
      inset: (x: 12pt, y: 9pt),
    )[
      #grid(
        columns: (1fr, auto),
        text(fill: rgb("#dbeafe"))[
          #if pricing.at("subtotal", default: "") != "" [Subtotal #pricing.subtotal]
        ],
        text(fill: white, size: 14pt, weight: "bold")[Total #pricing.total],
      )
    ]
  ]
}

#let bullet_list(items) = {
  grid(
    columns: (1fr, 1fr),
    gutter: 8pt,
    ..items.map(item => box(
      width: 100%,
      fill: brand-surface,
      stroke: 0.45pt + brand-rule,
      radius: 4pt,
      inset: 9pt,
    )[
      #text(fill: brand-accent, weight: "bold")[•] #item
    ]),
  )
}

#let appendix_block(title, body) = {
  box(
    width: 100%,
    fill: brand-surface,
    stroke: 0.45pt + brand-rule,
    radius: 4pt,
    inset: 10pt,
  )[
    #text(size: 10pt, weight: "bold", fill: brand-primary)[#title]
    #v(0.4em)
    #text(size: 8.8pt, fill: brand-muted)[#body]
  ]
}
