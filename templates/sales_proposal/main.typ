#import "theme.typ": *
#import "components.typ": *
#import "docforge/diagrams.typ": render-diagram

#let data = json("data.json")

#set document(title: data.title)
#set text(font: body-font, size: 10pt, fill: brand-text, lang: "en")
#set page(
  margin: (x: 1.55cm, y: 1.65cm),
  footer: context [
    #grid(
      columns: (1fr, auto),
      text(size: 7.5pt, fill: brand-muted)[#brand-footer],
      align(right)[#text(size: 7.5pt, fill: brand-muted)[Page #counter(page).display()]],
    )
  ],
)

#show heading: it => {
  set text(font: heading-font, fill: brand-primary)
  it
}

#brand-header-bar()

#proposal_hero(data)

#section_title("Scope of work", eyebrow: "What Forge will deliver")
#scope_list(data.scope)

#if data.at("diagram", default: none) != none [
  #section_title("Delivery model", eyebrow: "How the work moves")
  #box(
    width: 100%,
    fill: brand-surface,
    stroke: 0.45pt + brand-rule,
    radius: 5pt,
    inset: 12pt,
  )[
    #render-diagram(data.diagram)
  ]
]

#block(width: 100%, breakable: false)[
  #section_title("Timeline", eyebrow: "Planned engagement")
  #timeline_table(data.timeline)
]

#block(width: 100%, breakable: false)[
  #section_title("Investment", eyebrow: "Commercial summary")
  #pricing_table(data.pricing)
  #if data.pricing.at("terms", default: "") != "" [
    #v(0.45em)
    #text(size: 8.8pt, fill: brand-muted)[#data.pricing.terms]
  ]
]

#if data.at("assumptions", default: ()).len() > 0 [
  #block(width: 100%, breakable: false)[
    #section_title("Assumptions", eyebrow: "Dependencies")
    #bullet_list(data.assumptions)
  ]
]

#if data.at("next_steps", default: ()).len() > 0 [
  #block(width: 100%, breakable: false)[
    #section_title("Next steps", eyebrow: "Decision path")
    #bullet_list(data.next_steps)
  ]
]

#if data.at("discovery_notes", default: "") != "" [
  #block(width: 100%, breakable: false)[
    #section_title("Discovery notes", eyebrow: "Source context")
    #appendix_block("Slack discovery context", data.discovery_notes)
  ]
]
