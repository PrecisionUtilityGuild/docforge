#import "theme.typ": *

#let fmt-money(amount) = {
  "\$" + str(calc.round(amount, digits: 2))
}

#let line-total(item) = item.quantity * item.unit_price

#let calc-subtotal(items) = items.map(line-total).sum()

#let calc-tax(subtotal, tax-rate-pct) = subtotal * tax-rate-pct / 100

#let calc-total(subtotal, tax) = subtotal + tax

#let invoice-header(invoice-number, client, date, due-date) = {
  grid(
    columns: (1fr, 1fr),
    [
      #text(size: 9pt, fill: brand-muted)[Invoice \##invoice-number] \
      #text(weight: "bold")[Bill to:] #client
    ],
    align(right)[
      #text(size: 9pt, fill: brand-muted)[Date: #date] \
      #text(size: 9pt, fill: brand-muted)[Due: #due-date]
    ],
  )
  v(0.8em)
}

#let line-items-table(items) = {
  table(
    columns: (1.5fr, auto, auto, auto),
    inset: 8pt,
    stroke: 0.5pt + brand-muted.lighten(60%),
    table.header([*Description*], [*Qty*], [*Unit Price*], [*Amount*]),
    ..items
      .map(item => (
        item.description,
        str(item.quantity),
        fmt-money(item.unit_price),
        fmt-money(line-total(item)),
      ))
      .flatten(),
  )
}

#let totals-block(items, tax-rate-pct) = {
  let subtotal = calc-subtotal(items)
  let tax = calc-tax(subtotal, tax-rate-pct)
  let total = calc-total(subtotal, tax)
  v(0.6em)
  align(right)[
    #table(
      columns: (auto, auto),
      inset: 8pt,
      stroke: none,
      [Subtotal], fmt-money(subtotal),
      [Tax (#tax-rate-pct%)], fmt-money(tax),
      table.hline(stroke: 0.5pt + brand-accent),
      [*Total*], [*#fmt-money(total)*],
    )
  ]
}
