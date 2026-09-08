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
