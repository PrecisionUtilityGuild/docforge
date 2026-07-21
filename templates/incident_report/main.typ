#import "theme.typ": *
#import "components.typ": *

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

#incident_hero(data)

#section_title("Timeline", eyebrow: "Detection to resolution")
#timeline_table(data.timeline)

#section_title("Impact", eyebrow: "Customer and service exposure")
#impact_block(data.impact)

#block(width: 100%, breakable: false)[
  #section_title("Root cause", eyebrow: "Confirmed analysis")
  #root_cause_block(data.root_cause)
]

#section_title("Action items", eyebrow: "Follow-up ownership")
#action_table(data.actions)

#if data.at("evidence", default: "") != "" [
  #section_title("Evidence", eyebrow: "Audit source")
  #evidence_block(data.evidence)
]
