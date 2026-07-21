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

#let response-table(responses) = {
  let total = responses.map(r => r.count).sum()
  table(
    columns: (1.5fr, auto, auto),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Response*], [*Count*], [*Share*]),
    ..responses
      .map(r => (
        r.label,
        str(r.count),
        if total > 0 [
          #calc.round(100.0 * r.count / total, digits: 1)%
        ] else [
          —
        ],
      ))
      .flatten(),
  )
}

#let question-blocks(questions) = {
  for (i, q) in questions.enumerate() [
    == Q#(i + 1). #q.text
    #response-table(q.responses)
    #v(0.8em)
  ]
}
