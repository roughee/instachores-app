---
status: accepted
date: 2026-09-08
---

# Events are append-only; state is derived, never stored

The events tab is the only place a `complete`, `kudos`, `claim`, `ack`, `decline`, `adjust` or `bonus` ever gets written, and nothing in the app's API surface edits or deletes a row once it exists. We decided that correcting a mistake, undoing a tap, or fixing a mispriced task always means appending a new event, never rewriting an old one, because two things have to be true for a shared, offline-first, two-phone household: two phones writing at once must never conflict with each other, and every number the app shows (a balance, a streak, a week's total) must be exactly reproducible from the log at any later date, including "what did the app say last Tuesday." `deriveState()` recomputes every number from the event list on every call; nothing is cached as the source of truth, only as a read-time speed-up.

## Considered options

- **Append-only events, state derived by pure functions** (chosen). An `undo` is an event referencing the one it cancels; a mispriced task is fixed going forward with an `adjust` event, never by rewriting the original `complete`. Two phones offline for a day both come back and their events simply merge, deduplicated by id (Architecture §3, §8).
- **Mutable per-member balance rows, updated in place.** Simpler to read at a glance in the sheet, but two phones writing the same cell at nearly the same time is exactly the conflict Sheets has no transaction to resolve, and "why is my balance 14" has no history left to answer it.
- **Events that can be edited or soft-deleted.** Lets a typo be fixed in place, but a `complete` event edited after the fact silently changes a week that was already reviewed together (Plan §8, the weekly review), and combo and streak detection would have to watch a moving target instead of a fixed log.

## Consequences

- History only grows: a busy household is on the order of 15,000 rows a year (Architecture §4), which Sheets and a 30 s poll handle comfortably, but there is no compaction and none is planned.
- The IndexedDB snapshot, and the sheet's default of loading "events since the previous month" (Architecture §6), are caches of a window of that history, not the source of truth; a bug in either is fixed by reloading more of the log, never by editing an event.
- Undo has a matching cost: an undone task still exists as two rows forever. The UI hides it after 24 h (Plan §5.5), but it is still there if anyone goes looking, which is the intended trade for never allowing a silent edit.
- Hand-editing the events tab directly in the sheet stays possible and is treated as a feature for fixing a genuinely broken row (Architecture §9); the Zod parse at the boundary, not the script's API, is what guards against that going wrong.
