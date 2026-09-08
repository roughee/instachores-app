# HomeCrew

The shared vocabulary for a household chores app used by two adults and a 5-year-old: how a tap becomes points, how points become rest, and how two phones agree on what happened.

## Language

### People and household

**Household**:
The one shared home this app tracks: two adults, a kid, and the single Google Sheet that stores everything for them. In code: `Household`, one record per install.
_Avoid_: account, workspace, family (the baby is part of the household but is never a member)

**Member**:
A person recorded on the household's roster who can be credited for a task: an adult or a kid. In code: `Member`, keyed by `uid` inside `Household.members`.
_Avoid_: user, profile

**Adult**:
A member with full access: logs tasks, claims and acknowledges rewards, edits the catalog, earns points. In code: `Member` with `role: 'adult'`.
_Avoid_: parent (fine in conversation, not the schema's word)

**Kid**:
A member in star mode: an adult logs on their behalf, and their tasks earn stars instead of points. In code: `Member` with `role: 'kid'`.
_Avoid_: child

### Events

**Event**:
The one thing this app ever writes: an immutable, timestamped fact about something that happened, appended to the events tab and never edited or changed afterward. In code: `ChoreEvent`, a discriminated union on `type`.
_Avoid_: record, log entry, action, transaction

**Complete**:
The event that says a task was done, snapshotting the points it was worth at that moment so re-pricing the task later never rewrites history. In code: `ChoreEvent` with `type: 'complete'`.
_Avoid_: log (as a verb it is fine in conversation; as a noun it is not the event's name), check off

**Undo**:
The event that cancels a previous event by reference, appended within a few seconds of a tap rather than editing or deleting the original. In code: `ChoreEvent` with `type: 'undo'` and `refEventId`.
_Avoid_: delete, cancel, remove

**Kudos**:
A partner's tap of thanks on someone else's completed task, worth one point to the person thanked. In code: `ChoreEvent` with `type: 'kudos'`, `points: 1`. The button that creates it is labelled "clap" in the UI; kudos is the event behind it.
_Avoid_: clap, like

**Claim**:
A request to redeem a reward, created by the member who wants it; points do not move until the claim is acknowledged. In code: `ChoreEvent` with `type: 'claim'`, `rewardId`, `cost`.
_Avoid_: redemption, request

**Ack**:
The other adult's one-tap acceptance of a claim, which deducts the reward's cost from the claimant's balance, or splits it if the reward is pooled. In code: `ChoreEvent` with `type: 'ack'`, `refEventId`.
_Avoid_: accept, approve, confirm

**Decline**:
The other adult's refusal of a claim; nothing is deducted because nothing was taken. In code: `ChoreEvent` with `type: 'decline'`, `refEventId`.
_Avoid_: reject, deny

**Adjust**:
A manual correction to a member's points that is not tied to any task or reward, always carrying a note explaining why. In code: `ChoreEvent` with `type: 'adjust'`, `points`, required `note`.
_Avoid_: correction, override

**Bonus**:
Extra points awarded automatically when a combo is satisfied for the day, emitted by the client itself with a deterministic id so two phones never double-award it. In code: `ChoreEvent` with `type: 'bonus'`, `combo`, `day`.
_Avoid_: reward (a reward is claimed and spent; a bonus is earned automatically)

### Tasks, combos and the points economy

**Combo**:
A named group of tasks that, done together on the same day, earns a bonus on top of their individual points. In code: `ComboDef` in `domain/combos.ts`, keyed by `key`.
_Avoid_: streak (a streak is about consecutive days, not a same-day grouping), bundle

**Kitchen Reset**:
The household's flagship combo: hand-washing (pots or pans), counters, trash, and loading the dishwasher, all on the same day. In code: `KITCHEN_RESET` in `domain/combos.ts`, `key: 'kitchen-reset'`.
_Avoid_: reset, cleanup

**Group task**:
A task with sub-items, such as "Hand-wash dishes"; completing every one of its active sub-items on the same day earns its own combo bonus. In code: a `Task` with `comboBonus` set, whose id other tasks reference as `parentId`.
_Avoid_: parent task, category (a group task lives inside a category; it is not one)

**Sub-item**:
One of the smaller tasks that make up a group task, such as "Pots" under "Hand-wash dishes." In code: a `Task` whose `parentId` points at the group task's id.
_Avoid_: child task, subtask

**Points**:
The adult economy: what completing tasks, kudos, bonuses and adjustments add, and what an acknowledged claim subtracts, snapshotted per event so re-pricing a task never rewrites history. In code: the `points` field on `complete`, `kudos`, `bonus`, `adjust` and `claim` events.
_Avoid_: score, credits

**Stars**:
The kid's own economy, kept entirely apart from adult points, earned only from tasks marked for a kid. In code: `Derived.stars`, credited when a `complete` event's task has `forRole: 'kid'`.
_Avoid_: points (never call kid stars points), badges

**Balance**:
How many points an adult currently has: everything they earned minus every reward acknowledged against them. In code: `Derived.balances[uid]`.
_Avoid_: total, score

**Pooled**:
The sum of every adult's balance, treated as one shared pot for rewards both partners spend together. In code: `Derived.pooled`; a `Reward` with `kind: 'pooled'` draws from it, split evenly with any remainder charged to the claimant.
_Avoid_: shared balance, joint account

**Household bar**:
The single progress bar showing the household's total points against its weekly or monthly target; the headline number, not the individual split. In code: rendered from `Rollup.household` and `Rollup.target`.
_Avoid_: progress bar (there are several bars in the app; this is the one on the household total), main bar

**Quick row**:
The three tasks shown at the top of the Log screen, learned from the last 14 days of completions and backed by seeded defaults on day one. In code: `Derived.quickRow`, built from `DEFAULT_QUICK_ROW` in `domain/seed.ts`.
_Avoid_: shortcuts, favorites

**Heat strip**:
The 7- or 30-day strip that lights up a day when the counters task was logged that day, used to show the counters streak at a glance. In code: `Derived.heatStrip`.
_Avoid_: calendar, heatmap

**Streak**:
How many days in a row, ending today or yesterday, the counters task has been logged; it breaks the moment a day is missed. In code: `Derived.streaks.countersClean`.
_Avoid_: combo (a combo is same-day; a streak is consecutive days)

**Due**:
A task is due when it was done before and its frequency's window has elapsed since; a task that was never logged is not due. In code: `isDue()` in `domain/schedule.ts`, surfaced as `Derived.dueDots`.
_Avoid_: overdue, late (due is a gentle nudge, not a nag)

### Sync and offline

**Outbox**:
The ordered queue of writes waiting to reach the sheet, held in IndexedDB so a tap applies to local state immediately and is never lost offline. In code: `Outbox` in `data/outbox.ts`, entries typed by `OutboxEntry`.
_Avoid_: queue, pending writes

**Snapshot**:
The last-known copy of the household, members, tasks, rewards and events kept in IndexedDB, so the app opens with data before any network call. In code: `Snapshot` in `data/snapshot.ts`.
_Avoid_: cache (it is one, but "snapshot" is this project's name for it)

**Cursor**:
The latest `loggedAt` timestamp seen from the sheet, used to ask for "events since" on the next poll instead of the whole history. In code: `SnapshotData.cursor`, advanced by `nextCursor()` in `data/merge.ts`.
_Avoid_: checkpoint, offset

### Identity and infrastructure

**Setup link**:
The one link that hands a second phone everything it needs to join a household: the script URL and the household secret, base64url-encoded in the URL hash. In code: `SetupLink` schema, `encodeSetupLink` / `decodeSetupLink`.
_Avoid_: invite, invite link

**Secret**:
The shared value every request must include to prove it belongs to this household; it lives on the phones and in the script's properties, never in the repo or the bundle. In code: `SetupLink.secret`.
_Avoid_: password, key, token

**Sheet**:
The single Google Sheet that is the household's entire database: one tab per entity, one row per record. In code: reached only through `HouseholdRepo`; the app never touches it directly.
_Avoid_: spreadsheet, database, backend (the sheet is the data; the script is the backend)

**Script**:
The Apps Script web app that is the only path into the sheet: it checks the secret, appends events under a lock, and answers polls and writes. In code: `apps-script/Code.js`, reached through `SheetsRepo`.
_Avoid_: API, server, backend

**Demo mode**:
A no-network way to try the app: the Welcome screen's "Try the demo" link loads a seeded household into `MemoryRepo` instead of connecting to a sheet. In code: `MemoryRepo` seeded through `demoRepoSeed()` in `data/demo.ts`.
_Avoid_: sandbox, test mode

## Relationships

- A **household** has **members**; each member is an **adult** or a **kid**.
- Every **event** carries an `actorUid` (who tapped) and, where it applies, a `forUid` (who is credited).
- A **complete** event references a **task**; a **group task**'s **sub-items** are themselves tasks with a `parentId`.
- A **combo** (including the **Kitchen Reset**) watches a set of tasks; when they are all done the same day it produces a **bonus** event.
- **Undo**, **kudos**, **ack** and **decline** all reference an earlier event by `refEventId`; none of them edit or remove what they reference.
- A **claim** turns into either an **ack** (points leave the claimant's **balance**, or the **pooled** balance) or a **decline** (nothing changes).
- The **outbox** holds writes not yet on the **sheet**; the **snapshot** holds the last-known read from it, advanced by the **cursor**.
- A phone joins a **household** with a **setup link**, which carries the **script**'s URL and the household **secret**; **demo mode** needs none of the three.

## Flagged ambiguities

- **"Sheet" is overloaded.** The Google Sheet (the database) and `Sheet` (the bottom-sheet UI component used for secondary actions, per Plan §5.4) share a name by coincidence. This glossary reserves "sheet" for the database; the UI component should be called "bottom sheet" in conversation to keep the two apart.
- **"Clap" vs "kudos."** The Today screen's button is labelled "clap" (Plan §5.5); the event it creates is `type: 'kudos'`. Both names are in active use for the same action; this glossary treats kudos as canonical and clap as the button's copy.
- **"Partner" is not a schema word.** Both partners say "my partner" constantly in conversation, and it is the right word there, but the schema only knows "adult." Nothing to fix, just worth knowing the two vocabularies do not fully overlap on purpose.
