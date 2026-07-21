#import "theme.typ": *
#import "docforge/charts.typ": render-charts

#let report-header(period) = {
  align(right, text(size: 9pt, fill: brand-muted)[Period: #period])
  v(0.4em)
  line(length: 100%, stroke: 0.5pt + brand-accent)
  v(0.8em)
}

#let fmt-pct(rate) = str(calc.round(rate, digits: 1)) + "%"

#let cohort-table(cohorts) = {
  let max-weeks = calc.max(..cohorts.map(c => c.retention_rates.len()))
  let week-headers = range(max-weeks).map(w => [*W#w*])
  let week-cols = range(max-weeks).map(_ => auto)
  table(
    columns: (1fr, auto,) + week-cols,
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Cohort*], [*Size*], ..week-headers),
    ..cohorts
      .map(c => {
        let rates = c.retention_rates.map(r => fmt-pct(r))
        let pad-count = max-weeks - rates.len()
        let padding = range(pad-count).map(_ => "—")
        (c.name, str(c.size), ..rates, ..padding)
      })
      .flatten(),
  )
}

#let insights-block(items) = {
  for item in items [
    - #item
  ]
}
