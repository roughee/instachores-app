---
name: Feature
about: A new behaviour or change, scoped as one ticket
title: "[Feature] "
labels: needs-spec
---

<!-- Mirrors the ticket template in Plan.md §7.3. Fill what you know; /grill-with-docs and /to-tickets can refine this. -->

## Behaviour

<!-- What should happen, in plain terms, one behaviour. -->

## Tests that must go red first

<!-- Name the tests that will prove this, by layer, e.g. "domain: deriveState adds points to forUid for a complete event" -->

## Out of scope

<!-- What this ticket deliberately does not cover, with links to the tickets that do. -->

## Done when

<!-- Copy or adapt from Plan.md §7.3, e.g.: -->
- [ ] all named tests exist, were seen failing, now pass
- [ ] vue-tsc, eslint, vitest, build all green in CI
- [ ] screenshots light + dark attached (UI ticket)
- [ ] reviewed by the other partner (or by /code-review + self if solo that week)
