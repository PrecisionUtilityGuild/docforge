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

#let line-items-table(items) = {
  table(
    columns: (1.5fr, 1fr),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Category*], [*Amount*]),
    ..items.map(item => (item.category, item.amount)).flatten(),
  )
}

#let totals-block(totals) = {
  v(0.6em)
  table(
    columns: (1.5fr, 1fr),
    inset: 8pt,
    stroke: 0.5pt + brand-accent.lighten(50%),
    fill: (_, row) => if row >= 1 { rgb("#faf5ff") },
    table.header([*Total*], [*Amount*]),
    [Revenue], totals.revenue,
    [Expenses], totals.expenses,
    [*Net*], [*#totals.net*],
  )
}
