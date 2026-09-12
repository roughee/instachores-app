# Testing loop

How a change gets built here, and what proves it. The rules come from `docs/Plan.md` §7.5; this page is the practical version.

## The loop

Every behaviour starts as a failing test. The loop is red, green, refactor, and it runs in a terminal that stays open:

```bash
npm run test:watch          # Vitest in watch mode; reruns the affected files on save
npm run test:watch -- derive   # only files matching "derive"
```

1. **Red.** Write the test, named after the behaviour ("an undo gives its referenced event zero points"). Watch it fail. Check *why* it failed: a missing export fails differently from a wrong number, and only the wrong number proves the test can catch a regression. If the failure is a missing export, add the smallest stub and watch it fail again on the assertion.
2. **Green.** Write the least code that passes. Do not touch anything the test does not ask for.
3. **Refactor.** With the file still green, clean up. If the test goes red during a refactor that did not change behaviour, the test was testing implementation and needs rewriting.
4. **Before the PR:**

```bash
npm run check               # typecheck + tests with coverage gates, the same as CI
```

The `/tdd` skill drives this loop one vertical slice at a time. `/implement` runs it per ticket and finishes with `/code-review`.

## Gates

`npm run check` is what CI runs on every pull request (`.github/workflows/ci.yml`). It fails on:

| Gate | Command | Threshold |
|---|---|---|
| Types, including SFC templates | `vue-tsc --noEmit` | zero errors |
| Tests | `vitest run --coverage` | all green |
| Coverage, `src/domain/**` and `src/schemas/**` | same run | 100% lines and functions |
| Coverage, everything else under `src/` | same run | 80% lines |

The pure layers get 100% because they are small and any untested line there is a future argument about points. The number is a floor; the red-first rule is the goal.

## Where tests live and what they prove

```
tests/
├── helpers/fixtures.ts     builders that go through the Zod schemas; fixed NOW, tz, ids
├── schemas/                accept/reject, sheet-cell coercion, JSON round trips, setup link
├── domain/                 time (DST), schedule, combos, derive, seed data
├── data/                   (next) SheetsRepo against a fake fetch, outbox replay
├── stores/                 (next) Pinia actions against MemoryRepo
├── components/             (next) @vue/test-utils
└── e2e/                    (next) Playwright on the built PWA
```

| Layer | Regression it must catch |
|---|---|
| `domain/time` | week boundary drifting off Monday 00:00 household-local, especially across DST |
| `domain/derive` | double-counted kudos, undo not cancelling, own-ack deducting, kid stars leaking into adult points, category totals not matching member totals |
| `domain/combos` | a combo satisfied by the wrong tasks, a second bonus for the same day, an undone complete still counting |
| `domain/schedule` | a never-done task nagging, an adhoc task going due |
| `schemas/` | a field renamed without a migration, points above 50, a sheet row with TRUE/FALSE or empty cells failing to parse |

## Writing a good test here

- **Fixtures come from schemas.** Use `task()`, `reward()`, `household()`, `complete()`, `event()` from `tests/helpers/fixtures.ts`. They call `parse`, so a fixture can never be a shape the app rejects.
- **Time is injected.** `NOW` is Wednesday 2026-09-09 21:00 in Vilnius. Pass `now` and `tz` explicitly; never call `new Date()` without arguments in a test or in `src/domain/`.
- **Ids are explicit.** `nextId()` is deterministic within a run. Combo bonus ids are computed with `comboBonusId`.
- **One behaviour per test.** Several `expect`s are fine when they check the same behaviour from two sides.
- **Name the bug.** A regression test for an issue keeps the issue number in its name: `startOfWeek holds across the spring DST change (#140)`.
- **No snapshots, no "renders without crashing".** They pass on anything.

## Bugs

The first commit on a `fix/` branch is a test that reproduces the bug and fails on `main`. The fix is the second commit. The test stays as the regression guard. `/diagnosing-bugs` walks this.

## Proving the tests can fail

Once a month, or when a domain file changes shape, break a rule on purpose and watch the right test go red. Three that were checked when the suite was written:

| Mutation | Tests that caught it |
|---|---|
| `liveEvents` stops honouring undo events | "an undo gives its referenced event zero points", "ignores completes that were undone" |
| `startOfWeek` returns UTC midnight | all five `startOfWeek` tests and the week rollup boundary test |
| `detectCombos` stops checking for an existing bonus id | "emits nothing when the bonus for that day already exists" |

Stryker can automate this on `src/domain/` later (Plan §7.5).

## Running a single file or test

```bash
npx vitest run tests/domain/time.test.ts
npx vitest run -t "spring DST"
```

## The e2e layer (Playwright, issue #22)

Everything above runs against source, in Node, with a fake `fetch` or `MemoryRepo`. `e2e/` is different on purpose: it runs Playwright/Chromium against the **production build** (`vite build` then `vite preview`), with the Apps Script endpoint mocked in the browser via `page.route()` — proof that the built bundle, the service worker and hash routing actually work, not just that the source does.

```bash
npm run e2e          # vite build && playwright test
npx playwright test e2e/offline-log.spec.ts   # one file
npx playwright show-report                     # the last CI run's HTML report, if one was generated
```

Locally this uses the sandbox's preinstalled Chromium (`playwright.config.ts` points `executablePath` at it) — never run `playwright install` here, same rule as `scripts/screenshots.mjs`. In CI, the `e2e` job (`.github/workflows/ci.yml`, `needs: check`) has no browser preinstalled, so it runs `npx playwright install --with-deps chromium` first; the config switches on `process.env.CI`.

What it covers, one spec per file under `e2e/`:

| Spec | Proves |
|---|---|
| `connect-and-log.spec.ts` | Connect by setup link (`#/welcome?s=…`), pick a member, land on Log; a quick-row tap updates the household bar and sends exactly one `events.append` |
| `offline-log.spec.ts` | A tap while offline (`context.setOffline(true)`) still updates the bar; back online, the queued event is sent once and the outbox count returns to zero |
| `two-contexts-sync.spec.ts` | An event appended in one browser context appears in another context's Today list within one poll interval |
| `screenshots-and-colors.spec.ts` | Light/dark screenshots of Log and Overview, saved as test artifacts, plus a colour audit: every computed `color`/`background-color` on those screens must resolve to a token from `tokens.css` (or the documented member-color exception) |
| `routing-and-service-worker.spec.ts` | A hard refresh on a hash route (`#/overview`) returns the app, not a 404; the service worker serves the shell when the page reloads offline |
| `schedule-flow.spec.ts` | "Do all" on a combo group opens "Next time?" with its interval preselected; scheduling sends complete/bonus/schedule events in order, folds the group on Category, lists it on `#/schedule`'s "This week" and Recently done, syncs the fold to a second context within one poll, and "bring back early" from the fold sends `unschedule` and re-lists it |

`e2e/support/mockSheet.ts` is the mocked script: a small in-memory "sheet" (`MockSheet`) that answers `bootstrap`, `events.since`, `events.append` and `version` the same way `apps-script/Code.js` does, plus a log of every `events.append` call for assertions. Route it into a `BrowserContext` with `routeMockSheet(context, sheet)`; the same `MockSheet` instance routed into two contexts is how the two-contexts spec makes them see each other, the same as two phones sharing one real sheet.

The two-contexts spec needs a poll faster than the real 30s cadence: `?pollMs=` is a dev-only query flag (`src/composables/usePwa.ts`'s `readPollIntervalMs`, wired in `src/main.ts`), harmless in production since nobody links to the app with it, unit-tested like the other force flags (`hasFlag`).

Screenshots and Playwright's own traces/reports land in `e2e-results/` and `playwright-report/` (gitignored); CI uploads them as artifacts on every run, pass or fail.
