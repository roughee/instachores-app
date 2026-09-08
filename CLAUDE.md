# HomeCrew (instachores-app)

Household chores PWA for two adults and a 5-year-old: Vue 3 + TypeScript + Vite, Firestore sync, event-sourced points, hosted on GitHub Pages. The full plan is `docs/Plan.md`; read its §5 (pages), §6 (architecture) and §7 (process) before building anything.

## Where things are

- `docs/Plan.md`: product plan, task catalog, architecture, process, roadmap.
- `docs/design/DESIGN.md`: design read, dials, color tokens, components, dark-mode protocol, UI pre-flight.
- `docs/agents/`: per-repo configuration read by the engineering skills.
- `.claude/skills/`: vendored skills (see below).

## Working rules (Plan §7)

- Every change is an issue, becomes a branch, is built test-first, goes through a PR, merges only when CI is green.
- Red first: a test is seen failing before the code exists. Domain and schema layers require it; everywhere else it is the default.
- Points math lives only in `src/domain/` (pure TypeScript, no Vue, no Firebase). Every boundary parses through Zod.
- UI tickets start with the Design Read from `DESIGN.md` §1 and end with its pre-flight. Screenshots in light and dark on every UI PR.
- No em-dashes in UI strings. No hard-coded colors in components. Phosphor icons only.

## Agent skills

Vendored from [mattpocock/skills](https://github.com/mattpocock/skills) (v1.2.3, MIT) and [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT). Licenses are in `.claude/skills/`.

Flow: `/grill-with-docs` on a plan, `/to-spec` to publish the epic, `/to-tickets` to split it, `/implement` (driving `/tdd`) per ticket, `/code-review` before the PR. `/triage` for incoming bugs and ideas, `/diagnosing-bugs` for anything broken, `/improve-codebase-architecture` every few weeks, `/prototype` for design questions with real trade-offs, `/handoff` at the end of a session. `/design-taste-frontend` for anything visual.

### Issue tracker

GitHub Issues on this repo, one ticket per PR. See `docs/agents/issue-tracker.md`.

### Triage labels

The Plan §7.3 set (`needs-spec`, `blocked`, `ready`, `wontfix`, plus kind labels). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root and `docs/adr/`. See `docs/agents/domain.md`.
