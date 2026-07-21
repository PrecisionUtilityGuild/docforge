#import "theme.typ": *
#import "components.typ": *

#let data = json("data.json")

#set document(title: data.title)
#set text(font: body-font, size: 11pt, fill: brand-primary)
#set page(
  margin: (x: 2cm, y: 2.2cm),
  footer: context [
    #align(center)[
      #text(size: 8pt, fill: brand-muted)[#brand-footer · #counter(page).display()]
    ]
  ],
)

#show heading: it => {
  set text(font: heading-font, fill: brand-primary)
  it
}

#brand-header-bar()

#memo-header(data.at("author", default: ""), data.at("date", default: ""))

#align(center)[
  #text(size: 22pt, weight: "bold")[#data.title]
]
#v(1.2em)

#memo-summary(data.summary)

#for section in data.sections [
  #section-block(section.title, section.body)
]

#if data.at("risks", default: ()).len() > 0 [
  = Risks
  #risk-table(data.risks)
]

#if data.at("actions", default: ()).len() > 0 [
  = Action Items
  #action-table(data.actions)
]
