#let brand-primary = rgb("#111111")
#let brand-accent = rgb("#2563eb")
#let brand-muted = rgb("#64748b")
#let brand-background = rgb("#FFFFFF")
#let brand-text = rgb("#1A1A1A")
#let brand-footer = "Blameless Postmortem"

#let body-font = "Libertinus Serif"
#let heading-font = "Libertinus Serif"

#let brand-logo = none
#let brand-logo-alt = ""
#let brand-header-bar() = []

#let severity-color(sev) = {
  if sev == "critical" { rgb("#991b1b") }
  else if sev == "high" { rgb("#dc2626") }
  else if sev == "medium" { rgb("#d97706") }
  else { rgb("#16a34a") }
}
