#let brand-primary = rgb("#18181b")
#let brand-accent = rgb("#dc2626")
#let brand-accent-2 = rgb("#475569")
#let brand-muted = rgb("#667085")
#let brand-rule = rgb("#e4e7ec")
#let brand-surface = rgb("#f8fafc")
#let brand-background = rgb("#FFFFFF")
#let brand-text = rgb("#18181b")
#let brand-footer = "Incident Report — Internal"

#let body-font = "New Computer Modern"
#let heading-font = "New Computer Modern"

#let brand-logo = none
#let brand-logo-alt = ""
#let brand-header-bar() = []

#let severity-color(sev) = {
  if sev == "critical" { rgb("#991b1b") }
  else if sev == "high" { rgb("#dc2626") }
  else if sev == "medium" { rgb("#d97706") }
  else { rgb("#16a34a") }
}
