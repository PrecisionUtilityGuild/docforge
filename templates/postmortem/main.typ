#import "theme.typ": *
#import "components.typ": *

#let data = json("data.json")

#let footer-label = {
  let snippets = data.at("typst_snippets", default: none)
  if snippets != none {
    let note = snippets.at("footer_note", default: "")
    if note != "" { note } else { brand-footer }
  } else {
    brand-footer
  }
}

#set document(title: data.title)
#set text(font: body-font, size: 11pt, fill: brand-primary)
#set page(
  margin: (x: 2cm, y: 2.2cm),
  footer: context [
    #align(center)[
      #text(size: 8pt, fill: brand-muted)[#footer-label · #counter(page).display()]
    ]
  ],
)

#show heading: it => {
  set text(font: heading-font, fill: brand-primary)
  it
}

#brand-header-bar()

#postmortem-header(data.severity, data.date)

#align(center)[
  #text(size: 22pt, weight: "bold")[#data.title]
]
#v(1em)

#summary-block(data.summary)

= Timeline
#timeline-table(data.timeline)
#v(1em)

= Impact
#impact-block(data.impact)
#v(1em)

= Root Cause
#data.root_cause
#v(1em)

= What Went Well
#bullet-list(data.what_went_well)
#v(1em)

= What Went Wrong
#bullet-list(data.what_went_wrong)
#v(1em)

= Action Items
#action-table(data.action_items)
#v(1em)

= Lessons Learned
#bullet-list(data.lessons_learned)
