<!-- One PR per ticket. Delete any section marked UI only if this PR has no UI changes. -->

## What

<!-- One paragraph: what changed, in plain terms. -->

## Why

<!-- Link the ticket, e.g. Closes #123 -->

Closes #

## Tests

<!-- List the tests added, then paste the red run output or a link to the CI run of the first failing run. -->

## Screenshots light / dark

<!-- UI only. Attach a screenshot of the change in both themes. -->

## UI pre-flight

<!-- UI only. Copy the checklist from docs/design/DESIGN.md §8 verbatim, unchecked, and tick honestly. -->

- [ ] Design read declared at the top of the ticket or PR, dials stated (4 / 3 / 5 unless argued otherwise)
- [ ] Zero em-dashes or en-dashes in any visible string (UI copy, empty states, toasts, aria-labels)
- [ ] No hard-coded colors; every color comes from a token in `tokens.css`
- [ ] One accent (`--primary`) used only for FAB, active tab, household bar, primary buttons
- [ ] Category color appears only on tiles, chips and chart segments, always beside an icon and a label
- [ ] One radius system: 16 card / 12 button / 999 chip / 28 sheet
- [ ] Every touch target >= 48 px; every text on its surface >= 4.5:1; contrast test green
- [ ] Icons from `@phosphor-icons/vue` only, weight regular, no hand-rolled SVG, no emoji as icons
- [ ] Every animation justified in one sentence; all gated by `prefers-reduced-motion`; nothing idle
- [ ] Empty, loading (offline / from cache) and error states present for every new screen or list
- [ ] Rendered and screenshotted in light and dark, both attached to the PR
- [ ] Safe-area insets respected; nothing hidden behind the gesture bar or the bottom tab bar
- [ ] Copy re-read: verbs first, no exclamation marks, no filler ("successfully", "awesome")
- [ ] No AI tells from Taste Skill §9: gradients, glassmorphism, three equal cards, decorative dots, confetti

## Risk

<!-- Does this touch the data model, need a migration, change apps-script, or change a schema? A schema change needs both partners' approval and an ADR if it is not backward compatible. -->
