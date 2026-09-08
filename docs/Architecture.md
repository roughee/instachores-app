# HomeCrew architecture

How the pieces fit: the layers, the path of one tap from thumb to spreadsheet and back, the sheet layout, the Apps Script API, sync and offline, identity, and how the data layer gets swapped later. Product decisions stay in `docs/Plan.md`; decisions with a trade-off are recorded in `docs/adr/`.

## 1. Overview

A static PWA (Vue 3, TypeScript, Vite) served from GitHub Pages. All state is derived from an append-only list of events. The events, the task catalog, the rewards and the household settings live in one Google Sheet. A bound Apps Script web app is the only API in front of that sheet. Each phone keeps a local copy in IndexedDB, writes to a local outbox first, and polls the script for rows it has not seen.

```
┌──────────────┐   fetch (JSON, secret)   ┌──────────────────┐   SpreadsheetApp   ┌──────────────┐
│  Phone A     │ ───────────────────────▶ │  Apps Script     │ ─────────────────▶ │ Google Sheet │
│  PWA + IDB   │ ◀─────────────────────── │  web app (doPost)│ ◀───────────────── │ 5 tabs       │
└──────────────┘        rows since        └──────────────────┘                    └──────────────┘
       ▲                                           ▲                                      ▲
       │ same                                      │ same                                 │ edited by hand too
┌──────────────┐                                   │                                      │ (catalog, point values)
│  Phone B     │ ──────────────────────────────────┘                                      │
│  PWA + IDB   │                                                                          │
└──────────────┘                                                                    both partners are editors
```

There is no server we run, no database we administer, no accounts. Decision and trade-offs: ADR-0001.

## 2. Layers

Dependencies point downward only. Nothing below the app-state layer imports Vue or Pinia. The domain layer imports nothing but schemas.

| Layer | Lives in | Responsibility | Imports |
|---|---|---|---|
| UI | `src/screens/`, `src/components/` | Vue SFCs. Read Pinia getters, call store actions. No business rules. | stores, composables |
| App state | `src/stores/` | Pinia: `household`, `catalog`, `events`, `sync`, `prefs`. Hold parsed data, expose getters that call the domain. Own the optimistic apply of outbox entries. | domain, schemas, data |
| Domain | `src/domain/` | Pure TypeScript: `derive.ts` (balances, rollups, streaks), `combos.ts`, `schedule.ts`, `time.ts`, `ids.ts`, `seed.ts`. Time and ids are injected. `Math.random` is banned here. | schemas |
| Schemas | `src/schemas/` | Zod schemas for Household, Member, Task, Reward, ChoreEvent, Backup, SetupLink, plus `migrate.ts`. Types are `z.infer`. | zod |
| Data | `src/data/` | `repo.ts` (the `HouseholdRepo` interface), `sheetsRepo.ts`, `outbox.ts`, `snapshot.ts`, `memoryRepo.ts`. Parse on every read, parse before every write. | schemas, idb-keyval |
| Backend | `apps-script/` | `Code.js`: `doPost` router, sheet I/O, lock, secret check. Deployed with `clasp`. | Apps Script runtime |

The `HouseholdRepo` interface is the seam:

```ts
export interface HouseholdRepo {
  watchHousehold(id: string, cb: (h: Household) => void): Unsubscribe
  watchTasks(id: string, cb: (t: Task[]) => void): Unsubscribe
  watchRewards(id: string, cb: (r: Reward[]) => void): Unsubscribe
  watchEvents(id: string, since: Date, cb: (e: ChoreEvent[]) => void): Unsubscribe
  appendEvent(id: string, e: ChoreEvent): Promise<void>
  upsertTask(id: string, t: Task): Promise<void>
  upsertReward(id: string, r: Reward): Promise<void>
  connect(link: SetupLink): Promise<Household>
  sync(): Promise<SyncResult>
}
```

`SheetsRepo` implements `watch*` by calling back immediately from the local snapshot and again after every poll. `MemoryRepo` implements the same interface in memory for tests and the demo. A future `FirestoreRepo` would call back from live listeners. Nothing above the interface knows which one it has.

## 3. One tap, end to end

1. The user taps "Pots" on the Log screen. `eventStore.complete(taskId)` builds a `complete` event with a client UUID, `actorUid` and `forUid` = this phone's member, `points` = the task's current points, `at` = now.
2. The event is validated with `ChoreEvent.parse`, written to the **outbox** in IndexedDB, and applied to the in-memory event list. The household bar re-derives in the same frame. A toast with Undo appears; haptic tick.
3. `syncStore` notices the outbox is non-empty and the phone is online, and calls `repo.sync()`.
4. `SheetsRepo.sync()` POSTs `{ action: 'events.append', secret, events: [...] }` to the script URL with all pending outbox entries, oldest first.
5. The script checks the secret, takes a `LockService` lock, reads the existing ids on the `events` tab, appends only the rows whose ids are new, stamps `loggedAt` with the server time, releases the lock, and answers `{ ok: true, appended: [...ids], loggedAt: '...' }`.
6. `SheetsRepo` removes the confirmed entries from the outbox. Entries the script did not confirm stay and are retried on the next flush.
7. In the same `sync()` call, the repo GETs `events.since` with the last `loggedAt` cursor it has, receives Phone B's rows from the meantime, parses each with `safeParse`, merges by id into the snapshot, persists the snapshot to IndexedDB, and fires the `watchEvents` callback.
8. Phone B polls within 30 s (or immediately when its app comes to the foreground) and sees Phone A's event the same way.

Undo within 4 s appends an `undo` event pointing at the original; it travels the same path. Nothing is ever edited or deleted through the API.

## 4. The sheet

One spreadsheet is one household. Five tabs. Row 1 of every tab is the header and matches the Zod field names exactly, so the script can map rows to objects generically. All cells are formatted as plain text; dates are ISO 8601 strings.

| Tab | Shape | Columns |
|---|---|---|
| `household` | key/value, one row per key | `key`, `value` with keys `v`, `id`, `name`, `weeklyTarget`, `tz`, `createdAt` |
| `members` | one row per member | `uid`, `name`, `color`, `role` |
| `tasks` | one row per task | `v`, `id`, `name`, `category`, `points`, `freq`, `forRole`, `parentId`, `comboBonus`, `archived`, `sort`, `updatedAt`, `updatedBy` |
| `rewards` | one row per reward | `v`, `id`, `name`, `cost`, `kind`, `commitment`, `archived`, `updatedAt`, `updatedBy` |
| `events` | one row per event, append-only | `v`, `id`, `type`, `actorUid`, `at`, `loggedAt`, `note`, `taskId`, `forUid`, `points`, `refEventId`, `rewardId`, `cost`, `combo`, `day` |

Rules for the sheet:

- `uid` on `members` is a short slug (`ana`, `ben`, `mia`), chosen once when the household is set up, and never changed. Events reference it.
- `events` is the source of truth for points. Nobody edits a row there except to fix an obvious mistake, and never to remove one; append an `adjust` or `undo` instead. A row that fails to parse is skipped by the app and logged.
- `tasks` and `rewards` may be edited by hand. The script bumps nothing on hand edits, so set `updatedAt` when editing manually, or accept that the next app edit wins.
- Booleans are the strings `TRUE`/`FALSE` (what Sheets writes); the schema coerces them. Empty cells are `undefined`.
- Frozen header row, filter on, columns formatted as plain text. A `_template` tab is kept in the sheet for reference and is ignored by the script.

Sizing: about 40 events a day is 1,200 rows a month and 15,000 a year. Sheets is comfortable to a few hundred thousand rows; a yearly archive tab can be added long before that matters.

## 5. Apps Script API

One deployment, one URL, `doPost` only. Apps Script web apps only accept cross-origin requests that are "simple" in CORS terms, so the client sends `Content-Type: text/plain` with a JSON body and follows the redirect Apps Script issues. Responses are JSON via `ContentService`.

Request envelope:

```json
{ "secret": "…", "action": "events.since", "since": "2026-09-08T18:00:00.000Z" }
```

| Action | Input | Output | Notes |
|---|---|---|---|
| `bootstrap` | `since` | household, members, tasks, rewards, events since | First call after connect, and after a long offline period |
| `events.since` | `since` (ISO `loggedAt`) | `events`, `serverTime` | The poll. Filters by `loggedAt > since`; includes rows appended in the same second as `since` to avoid a boundary miss, client dedupes by id |
| `events.append` | `events[]` | `appended[]`, `skipped[]`, `loggedAt` | Under `LockService`. Skips ids already present. Rejects any event whose `points` > 50 or whose `actorUid` is not a member |
| `tasks.upsert` | `task` | `task` | Rejected with 409 if the row's `updatedAt` is newer than the incoming one |
| `rewards.upsert` | `reward` | `reward` | Same rule |
| `household.update` | partial household | household | Name, weekly target, tz |
| `seed` | tasks, rewards | counts | Only when the tabs are empty. Used once in Phase 1 from `seed.ts` |
| `version` | none | script version | Shown in the Sync panel |

Errors are `{ ok: false, code, message }` with `code` in `unauthorized` (401), `conflict` (409), `invalid` (400), `locked` (503, lock not acquired within 10 s). The client treats `locked` and any network failure as retryable and everything else as final.

Skeleton of `Code.js`:

```js
function doPost(e) {
  const req = JSON.parse(e.postData.contents)
  if (req.secret !== PropertiesService.getScriptProperties().getProperty('SECRET')) return json({ ok: false, code: 'unauthorized' })
  const handler = ACTIONS[req.action]
  if (!handler) return json({ ok: false, code: 'invalid', message: 'unknown action' })
  try { return json({ ok: true, ...handler(req) }) }
  catch (err) { return json({ ok: false, code: err.code || 'invalid', message: String(err) }) }
}

function appendEvents({ events }) {
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(10000)) throw Object.assign(new Error('busy'), { code: 'locked' })
  try {
    const sheet = tab('events'), existing = new Set(column(sheet, 'id'))
    const loggedAt = new Date().toISOString()
    const fresh = events.filter(ev => !existing.has(ev.id))
    if (fresh.length) sheet.getRange(sheet.getLastRow() + 1, 1, fresh.length, HEADERS.events.length)
      .setValues(fresh.map(ev => toRow('events', { ...ev, loggedAt })))
    return { appended: fresh.map(ev => ev.id), skipped: events.length - fresh.length, loggedAt }
  } finally { lock.releaseLock() }
}
```

Reads of `column(sheet, 'id')` scan the whole tab; at 15,000 rows that is well under a second. If it ever gets slow, keep an `_index` tab of ids or a yearly archive.

Deployment: "Execute as me" (the sheet owner), "Who has access: Anyone". Deploy from `apps-script/` with `clasp push && clasp deploy -i <deploymentId>` so the URL is stable; a "New deployment" would change the URL and invalidate every setup link. The deployment id lives in `apps-script/README.md`. The secret lives in Script Properties, never in the repo.

## 6. Client data layer

`src/data/sheetsRepo.ts` owns three things:

- **Snapshot** (`snapshot.ts`): the last-known household, members, tasks, rewards and events since the start of the previous month, in IndexedDB via `idb-keyval`. Loaded on startup before any network call, so the app opens with data offline. Persisted after every merge.
- **Outbox** (`outbox.ts`): an ordered list of pending writes (`events.append`, `tasks.upsert`, `rewards.upsert`) in IndexedDB. Appended before the store applies the write optimistically. An entry is removed only when the script confirms it. Replay is safe because appends are idempotent by id and upserts carry `updatedAt`.
- **Poller**: while the document is visible, `sync()` every 30 s; also immediately on `visibilitychange` to visible, on `online`, and after every outbox flush. Back off to 2 minutes after three consecutive failures, reset on success. The cursor is the largest `loggedAt` seen, stored with the snapshot.

`syncStore` (Pinia) exposes `online`, `outboxCount`, `lastPollAt`, `lastError`, `scriptVersion` for the status dot and the Sync panel, and a `syncNow()` action.

Every row from the script goes through `safeParse`; failures are logged with the row id and dropped in production, thrown in development. Every outgoing object goes through `parse` before it is queued.

## 7. Identity and the setup link

There are no accounts. A phone is connected to a household when it holds the script URL, the household secret and a member id.

- The first phone creates the sheet from the template, deploys the script, sets `SECRET` in Script Properties, and pastes the URL and secret into the Welcome screen once. Settings then shows a **setup link**: `https://<user>.github.io/homecrew/#/welcome?s=<base64url({ url, secret })>`.
- The second phone opens that link (or pastes it). The app calls `bootstrap`, shows the members from the sheet, the person taps their name, and the phone stores all three values in `localStorage` through the `SetupLink` and `Prefs` schemas.
- The secret never enters the repository or the built bundle. The bundle is public, the link is private, and that is the whole security model. Rotating the secret is one property edit plus re-sharing the link (ADR-0001).

## 8. Time and ids

- `at`: when the deed happened, phone local time, may be backdated by the user. Used for day, week and month buckets.
- `loggedAt`: stamped by the script on append. Used only as the poll cursor, never for points.
- Week boundaries are Monday 00:00 in the household timezone from the `household` tab. `time.ts` does all boundary math with an injected `now` and the tz, and is covered by DST tests.
- Event ids are client UUIDs, except combo bonuses, which use `combo-{day}-{hid}` so that two phones detecting the same combo append one row between them.

## 9. PWA and service worker

- `vite-plugin-pwa` precaches the app shell (HTML, JS, CSS, fonts, icons). `registerType: 'prompt'`: the new worker waits and the app shows "Update available, reload".
- The script URL is matched with a `NetworkOnly` strategy. The service worker never caches API responses; the repo's snapshot is the cache.
- Hash routing (`#/log`) because GitHub Pages has no rewrites.
- Manifest: `standalone`, maskable icon, `start_url: "./#/log"`, shortcuts for Kitchen Reset, trash and laundry.

## 10. Deploy

Two deployables, two cadences.

| What | How | When |
|---|---|---|
| The PWA | `deploy.yml`: `npm ci`, typecheck, lint, test, build, publish `dist/` to `gh-pages` | Every merge to `main` |
| The Apps Script | `clasp push && clasp deploy -i <deploymentId>` from `apps-script/`, by a human | When `apps-script/` changes, rarely |

A PR that touches `apps-script/` or `src/schemas/` needs both partners' approval and, if not backward compatible, an ADR. The script is versioned with a `VERSION` constant that the `version` action returns and the Sync panel shows, so a phone talking to a stale script is visible.

## 11. Testing map

| Layer | Tool | Proves |
|---|---|---|
| `domain/` | Vitest, table-driven, 100% line coverage | points math, combos, streaks, week and month boundaries across DST, stars separate from points |
| `schemas/` | Vitest | accept and reject cases, round trips, `v0` to `v1` migrations, sheet booleans and empty cells coerce correctly |
| `data/` | Vitest with a fake `fetch` | parse before send, bad rows skipped, outbox replays after reconnect without duplicates, cursor advances, backoff after failures |
| `apps-script/` | `test_` function in the script editor against a scratch sheet, manual before each deploy | secret rejected, duplicate id skipped, lock released on error, conflict on stale `updatedAt` |
| `stores/` | Vitest with `MemoryRepo` | actions append the right events, optimistic apply, undo window |
| components | Vitest + `@vue/test-utils` | `TaskGroup` emits sub-item ids, toast Undo wiring, `RewardCard` disabled reason |
| end-to-end | Playwright on the built PWA with a mocked script endpoint | two-tap log, offline log then reconnect, connect by setup link, claim and ack across two browser contexts, light and dark screenshots |
| tokens | Vitest | WCAG contrast over `tokens.css` |

## 12. Swapping the data layer later

If live updates start to matter, or a third household wants the app, the change is one new `HouseholdRepo` implementation:

- `FirestoreRepo`: `watch*` from `onSnapshot`, the outbox becomes unnecessary (the SDK has one), the setup link becomes a join code, and per-user security rules replace the shared secret.
- `SupabaseRepo`: the same with Realtime channels and row-level security; keep the outbox.

Migration is an export of the sheet through the `Backup` schema and an import on the other side. The domain, schemas, stores and screens do not change. Record the swap as a new ADR that supersedes ADR-0001.

## 13. Known limits

- Latency: about 30 s between phones, or instant on foreground. A single script call takes one to three seconds, which is why nothing in the UI waits on one.
- Security is a shared secret. Acceptable for chore data between two partners, not for anything else.
- Apps Script quotas are generous for this volume (thousands of executions a day) but a runaway poll loop would hit them; the backoff exists for that reason.
- Hand edits to the sheet can break a row. The parse-and-skip rule keeps the app up; the Sync panel shows a count of skipped rows so a typo is noticed.
- No push notifications. A time-driven Apps Script trigger can send an email or a Google Chat message if a nudge is ever wanted.
