#import "theme.typ": *

#let intake-header(client, date, contact) = {
  grid(
    columns: (1fr, 1fr),
    [
      #text(size: 9pt, fill: brand-muted)[Client] \
      #text(weight: "bold")[#client]
    ],
    align(right)[
      #text(size: 9pt, fill: brand-muted)[Date: #date]
    ],
  )
  v(0.4em)
  let parts = ()
  if contact.at("name", default: "") != "" { parts.push(contact.name) }
  if contact.at("role", default: "") != "" { parts.push(contact.role) }
  if contact.at("email", default: "") != "" { parts.push(contact.email) }
  if contact.at("phone", default: "") != "" { parts.push(contact.phone) }
  if parts.len() > 0 [
    #text(size: 9pt, fill: brand-muted)[Contact: #parts.join(" · ")]
  ]
  v(0.4em)
  line(length: 100%, stroke: 0.5pt + brand-accent)
  v(0.8em)
}

#let bullet-section(title, items) = [
  #metadata((type: "section", title: title, empty: items.len() == 0))
  <lint-section>
  = #title
  #for item in items [- #item]
  #v(0.6em)
]
