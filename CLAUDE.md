# HomeCrew (instachores-app)

Household chores PWA for two adults and a 5-year-old: Vue 3 + TypeScript + Vite, event-sourced points, a shared Google Sheet behind an Apps Script web app as the MVP data layer, hosted on GitHub Pages. The full plan is `docs/Plan.md`; read its §5 (pages), §6 (architecture) and §7 (process) and `docs/Architecture.md` before building anything.

## Where things are

- `docs/Plan.md`: product plan, task catalog, architecture summary, process, roadmap.
- `docs/Architecture.md`: layers, data flow, sheet layout, Apps Script API, sync and offline, identity, deploy, testing map.
- `docs/adr/`: architecture decision records. ADR-0001 is the Google Sheet data layer.
- `docs/Testing.md`: the testing loop, coverage gates, fixture rules, mutation checks.
- `docs/Setup.md`: the ten-minute procedure to create a real household sheet, deploy the Apps Script and seed the catalog (`scripts/household.ts`, `npm run household`).
- `docs/design/DESIGN.md`: design read, dials, color tokens, components, dark-mode protocol, UI pre-flight.
- `docs/agents/`: per-repo configuration read by the engineering skills.
- `docs/Process.md`: labels, branch naming, branch-protection settings, and the squash commit message format.
- `.claude/skills/`: vendored skills (see below).

## Commands

```bash
npm run test:watch   # the loop: Vitest in watch mode
npm run check        # what CI runs: vue-tsc, then vitest with coverage gates
npm test             # one run, no coverage
```

`docs/Testing.md` describes the red-green-refactor loop, the coverage gates (100% lines on `src/domain/` and `src/schemas/`), the fixture helpers, and how to prove a test can fail.

## Working rules (Plan §7)

- Every change is an issue, becomes a branch, is built test-first, goes through a PR, merges only when CI is green.
- Red first: a test is seen failing before the code exists. Domain and schema layers require it; everywhere else it is the default.
- Points math lives only in `src/domain/` (pure TypeScript, no Vue, no fetch). Every boundary parses through Zod.
- The data layer is `SheetsRepo` behind the `HouseholdRepo` interface. Writes go to the outbox first; the UI never waits on the network. The household secret never enters the repo.
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
