---
status: accepted
date: 2026-09-08
---

# Use a shared Google Sheet, behind an Apps Script web app, as the MVP data layer

The app is a static PWA on GitHub Pages with exactly two users in one household, and the plan's data model is already event-sourced (append-only events, state derived by pure functions). We decided that the MVP stores everything in one Google Sheet, with a small Apps Script web app as the only API, instead of Firebase Firestore. The deciding factor is that with two users the things Firestore provides (live listeners, a built-in offline queue, per-user security rules) matter less than what a spreadsheet provides: both partners can read and edit the data, point values included, in a tool they already use, and no new accounts or cloud projects are needed. The `HouseholdRepo` interface keeps the choice reversible at the data layer only.

## Considered options

- **Google Sheet + Apps Script web app** (chosen). Free. Events tab is append-only, one row per event, deduplicated by id under a script lock. Client polls every 30 s and on app focus; offline writes sit in an IndexedDB outbox. Identity is a shared secret from a setup link plus a self-declared member.
- **Firebase Firestore**. Free at this scale, live updates within seconds, offline queue and security rules in the SDK. Rejected for the MVP because it adds a cloud project, rules, an emulator for tests and roughly 100 KB gzipped of SDK for capabilities two users do not need. It remains the upgrade path.
- **Supabase**. Same shape as Firestore with SQL; would still need our own outbox. Alternative upgrade path.
- **An Excel file (.xlsx) in Google Drive**. Rejected outright: there is no row-level API, so every write is download, edit, re-upload of the whole file, which two phones would clobber, and there is no way to fetch "events since X".

## Consequences

- A partner's tap appears within about 30 s, or immediately on opening the app, rather than within 2 s. The Phase 1 success criterion in the plan changes accordingly.
- We own the offline path: an outbox and a cached snapshot in IndexedDB, and the replay-without-duplicates behaviour is covered by tests in `data/`.
- Security is obscurity-grade: anyone with the script URL and the household secret can read or append chore events. Nothing sensitive is stored, so this is accepted. The secret lives on the phones, never in the repo or the bundle.
- The Apps Script is a second deployable, deployed rarely with `clasp` to a fixed deployment id so the URL never changes.
- Hand edits in the sheet are a feature, not a bug: the Zod parse at the boundary is the guard against a broken row, and the script's API surface is what keeps events append-only from the app's side.
- Swapping to Firestore or Supabase later is a new `HouseholdRepo` implementation; the domain, schemas, stores and screens do not change.
