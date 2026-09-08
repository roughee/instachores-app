---
status: accepted
date: 2026-09-08
---

# Use Vue 3 over React and Svelte

The app is a small PWA, on the order of ten components, built and reviewed by the same two people it serves, needing offline-first state and a straightforward path to an installable Android PWA. We decided on Vue 3 with the Composition API and single-file components over React or Svelte, because Vue's ecosystem already covers the specific shape this app needs (Pinia for the stores, `vite-plugin-pwa`'s Vue integration, `@vue/test-utils` for component tests) without extra glue, and because a single-file component keeps a screen's template, script and token-only styles in one file, which matters more than usual when both partners, not only one developer, read the code.

## Considered options

- **Vue 3, Composition API, single-file components** (chosen). Pinia stores map directly onto the layered architecture (Architecture §2): one store per slice of state, getters that call `deriveState()`. `vite-plugin-pwa` has first-class Vue support. `@vue/test-utils` covers the component test layer (Architecture §11) without a separate library choice.
- **React.** Comparable capability, but state management is a separate decision (Zustand, Redux, plain context) rather than one obvious default for this app, and JSX mixes markup and logic in a way that is harder for a non-primary-developer partner to skim.
- **Svelte.** A smaller runtime and terser templates, but a thinner ecosystem for the specific pieces this app needs (a mature PWA plugin, an offline store pattern, component test tooling), and less prior familiarity on this team than Vue.

## Consequences

- The choice is expensive to reverse once made: every screen is a single-file component, every store is a Pinia store, `vite-plugin-pwa`'s Vue hooks are wired into `main.ts`, and the component tests are written against `@vue/test-utils`'s mounting API. Undoing it means rewriting `src/screens/`, `src/components/`, `src/stores/` and `tests/components/` together, not swapping one file.
- The domain and schema layers (`src/domain/`, `src/schemas/`) import nothing from Vue (Architecture §2), so they are unaffected either way; the framework choice is contained to the layers above them.
