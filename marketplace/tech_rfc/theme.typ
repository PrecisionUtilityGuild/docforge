#let brand-primary = rgb("#111827")
#let brand-accent = rgb("#2563eb")
#let brand-muted = rgb("#64748b")
#let brand-background = rgb("#FFFFFF")
#let brand-text = rgb("#1A1A1A")
#let brand-footer = "Internal RFC"

#let body-font = "Libertinus Serif"
#let heading-font = "Libertinus Serif"

#let brand-logo = none
#let brand-logo-alt = ""
#let brand-header-bar() = []

#let status-color(status) = {
  if status == "draft" { rgb("#6b7280") }
  else if status == "proposed" { rgb("#2563eb") }
  else if status == "accepted" { rgb("#059669") }
  else if status == "deprecated" { rgb("#d97706") }
  else { rgb("#dc2626") }
}
