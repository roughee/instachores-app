# HomeCrew Apps Script backend

`Code.js` is the only API in front of the household's Google Sheet. It is a
bound Apps Script web app: one `doPost`, one deployment, one URL. See
`docs/Architecture.md` §5 for the action table this implements and
`docs/adr/0001-google-sheet-as-mvp-database.md` for why a sheet at all.

## Files

- `Code.js`: the router, the sheet I/O, the lock, the secret check, the
  `setupTemplate_()` and `test_()` helpers with their public `setupTemplate()`
  and `runTests()` wrappers for the editor's Run picker. Plain Apps Script JavaScript, V8
  runtime, no modules.
- `appsscript.json`: manifest (`timeZone: Europe/Vilnius`, `runtimeVersion:
V8`, web app `executeAs: USER_DEPLOYING`, `access: ANYONE`).
- `.clasp.json.example`: copy to `.clasp.json` and fill in your own
  `scriptId`. The real `.clasp.json` is gitignored; it names a specific
  script and must never be committed.

## The sheet template

One spreadsheet is one household. Five tabs, header row matching the Zod
field names in `src/schemas/` exactly, all cells formatted as plain text
(`@` number format) so the script can read and write dates and numbers as
strings without Sheets reformatting them.

| Tab         | Shape                          | Header row                                                                                                                              |
| ----------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `household` | key/value, one row per key     | `key`, `value`                                                                                                                          |
| `members`   | one row per member             | `uid`, `name`, `color`, `role`                                                                                                          |
| `tasks`     | one row per task               | `v`, `id`, `name`, `category`, `points`, `freq`, `forRole`, `parentId`, `comboBonus`, `archived`, `sort`, `updatedAt`, `updatedBy`      |
| `rewards`   | one row per reward             | `v`, `id`, `name`, `cost`, `kind`, `commitment`, `archived`, `updatedAt`, `updatedBy`                                                   |
| `events`    | one row per event, append-only | `v`, `id`, `type`, `actorUid`, `at`, `loggedAt`, `note`, `taskId`, `forUid`, `points`, `refEventId`, `rewardId`, `cost`, `combo`, `day` |

The `household` tab holds one row per key below the header, e.g.:

```
key           value
v             1
id            hh-ana-ben
name          Home
weeklyTarget  250
tz            Europe/Vilnius
createdAt     2026-09-08T00:00:00.000Z
```

`members` is filled in by hand once, before the app is used (each `uid` is a
short slug — `ana`, `ben`, `mia` — chosen once and never changed). `tasks`
and `rewards` are filled by the `seed` action from `src/domain/seed.ts`, or
by hand later.

**To build a fresh household sheet from the template:**

1. Create a new Google Sheet.
2. Attach this Apps Script project to it (`clasp clone <scriptId>` if the
   script already exists, or create a new bound script and push this code).
3. In the Apps Script editor, select `setupTemplate` in the function
   picker and click Run. It creates the five tabs with header rows and
   plain-text formatting on an empty spreadsheet. It is safe to re-run: it
   only creates a tab if one by that name does not already exist, and only
   ever writes the header row.
4. Fill in `members` by hand.
5. Deploy (below), set `SECRET` in Script Properties, then call the `seed`
   action once (or run it from the app's first-run flow) to fill `tasks`
   and `rewards` from `src/domain/seed.ts`.

## The secret

The script checks the `secret` field of every request against a value it
reads from **Script Properties** (Apps Script editor -> Project Settings ->
Script Properties -> add `SECRET`). The secret never appears in this repo,
in `appsscript.json`, or in the built PWA bundle: it travels once, inside
the base64url setup link, and lives only in Script Properties and on the
phones (`docs/Architecture.md` §7).

To rotate it: change the `SECRET` property and re-share the setup link.
Every phone that still has the old secret gets `{ ok: false, code:
'unauthorized' }` until it is updated.

## Deploying

The web app's URL is tied to a deployment id, not to the script itself.
Deploying with `clasp deploy` (no `-i`) creates a **new** deployment with a
**new** URL, which would break every setup link already handed out. Always
update the existing deployment:

```bash
cd apps-script
clasp push
clasp deploy -i <deploymentId>
```

The first deployment ever made has no existing id to reuse; `clasp deploy`
without `-i` on that first run prints the deployment id it created. **Write
that id down** — in your own private notes, or as a comment at the top of
your local (gitignored) `.clasp.json` — since this repo cannot hold it (it's
specific to one household's copy of the script, same as the secret). Every
deploy after the first passes `-i <that id>`.

Two partners approving `apps-script/` changes, and an ADR for anything not
backward compatible, is the rule from `docs/Architecture.md` §10 — the
script is a second deployable with its own, rarer cadence than the PWA.

## Before you deploy: run `runTests`

`test_()` creates a scratch spreadsheet (`SpreadsheetApp.create`), builds
the template and a couple of members on it, runs every scenario below
against it through the same `handleRequest`/action-handler code path the
real web app uses, logs `PASS`/`FAIL` per scenario to the Apps Script
execution log, and trashes the scratch spreadsheet in a `finally` block
whether or not everything passed.

To run it: open the Apps Script editor, select `runTests` in the function
picker, click Run, then check View -> Logs (or the execution transcript)
for `PASS`/`FAIL` lines and a final `ALL PASS (n)` or `n FAILED of n`.

Scenarios it checks:

1. A wrong secret is rejected (`unauthorized`) and appends nothing.
2. `events.append` with two ids already present and one new one appends
   exactly one row, reports both `appended` and `skipped`, and stamps
   `loggedAt`.
3. `events.since` returns an array plus a `serverTime`.
4. `tasks.upsert` with a stale `updatedAt` answers `conflict` and leaves the
   stored row unchanged.
5. `seed` fills empty `tasks`/`rewards` tabs, then refuses a second call.
6. The script lock is released even when a handler fails partway through
   (simulated by pointing at a broken sheet lookup) — a following
   `tryLock` succeeds immediately.

Run this before every `clasp deploy -i`, and any time `Code.js` changes.

## How this gets tested here (in CI)

Apps Script cannot run outside the Apps Script runtime, so it cannot run in
this repo's CI. Instead, `Code.js`'s pure logic (the row-mapping helpers and
every action handler) is written to take an injected `ctx` object
(`ctx.sheet(name)`, `ctx.lock()`, `ctx.secret()`) rather than reaching
directly for `SpreadsheetApp`/`LockService`/`PropertiesService`. In
production, `doPost` builds that `ctx` from the real services; in tests, it
is built from small in-memory fakes.

`Code.js` has no `import`/`export` — Apps Script does not support modules —
so `tests/apps-script/loadHomeCrew.ts` loads the file text with
`new Function('SpreadsheetApp', 'LockService', 'PropertiesService',
'ContentService', 'DriveApp', source)`, passing the fakes from
`tests/apps-script/fakeGas.ts` in as those five parameters. Every function
in `Code.js` is declared inside that same function body, so they close over
the fakes exactly as they close over the real globals when Apps Script
loads the file for real. `Code.js` finishes by assigning its testable
surface to `globalThis.HomeCrew`; that is the one thing the loader reads
back out afterwards (and immediately deletes off `globalThis`).

This was chosen over the alternative (wrapping the whole file as the _body_
of one `new Function(...)` call and returning an object from it) because
Apps Script itself needs `doPost`, `setupTemplate` and `runTests` to be
ordinary top-level function declarations — that is how the editor's "run
function" picker and the web app trigger find them. Structuring the file
around a `return {...}` would mean either duplicating the file for the two
environments or making the Apps-Script-editor version of the file look
unlike a normal `.gs` file. Attaching to `globalThis.HomeCrew` at the very
end keeps `Code.js` a normal, directly-deployable script and adds exactly
one line for testability.

`tests/apps-script/handlers.test.ts` exercises every acceptance criterion
above (secret check, dedup + `loggedAt` stamping, cursor filtering,
conflict detection, seed-then-refuse, lock release on error) against the
fakes. It is not part of the `src/**` coverage gate in `vitest.config.ts`,
but it runs on every `npm test` / `npm run check` and must stay green.
