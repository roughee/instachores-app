# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: the shared vocabulary ("event", "complete", "combo", "claim", "ack", "household bar", "quick row", "group task", "sub-item", "star").
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. ADR-0001 records the Google Sheet data layer; append-only events and Vue over React are next (Plan §7.2).
- **`docs/Plan.md`**: the product plan. §3 is the task catalog, §5 the pages and their acceptance criteria, §6 the architecture summary, §7 the process.
- **`docs/Architecture.md`**: the detailed architecture: layers, data flow, sheet layout, Apps Script API, sync, identity, testing map.
- **`docs/design/DESIGN.md`**: tokens, dials, design read, and the UI pre-flight for any UI work.

If `CONTEXT.md` or `docs/adr/` don't exist yet, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/
│   ├── Plan.md
│   ├── Architecture.md
│   ├── adr/
│   │   ├── 0001-google-sheet-as-mvp-database.md
│   │   ├── 0002-append-only-events.md
│   │   └── 0003-vue-over-react.md
│   ├── design/DESIGN.md
│   ├── specs/
│   └── agents/          <- this folder
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (Google Sheet as MVP database), but worth reopening because…_
