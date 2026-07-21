#let brand-primary = rgb("#111111")
#let brand-accent = rgb("#2563eb")
#let brand-muted = rgb("#64748b")
#let brand-background = rgb("#FFFFFF")
#let brand-text = rgb("#1A1A1A")
#let brand-footer = "Architecture Decision Record"

#let body-font = "Libertinus Serif"
#let heading-font = "Libertinus Serif"

#let brand-logo = none
#let brand-logo-alt = ""
#let brand-header-bar() = []

#let status-color(status) = {
  if status == "proposed" { rgb("#d97706") }
  else if status == "accepted" { rgb("#16a34a") }
  else { rgb("#64748b") }
}
