# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the label strings used in this repo's GitHub Issues, which are the set defined in `docs/Plan.md` §7.3.

| Label in mattpocock/skills | Label in our tracker | Meaning                                                        |
| -------------------------- | -------------------- | -------------------------------------------------------------- |
| `needs-triage`             | `needs-spec`         | New idea or bug; needs a `/grill-with-docs` pass before a spec |
| `needs-info`               | `blocked`            | Waiting on the reporter, a decision, or another ticket         |
| `ready-for-agent`          | `ready`              | Fully specified ticket with red-first tests named; buildable   |
| `ready-for-human`          | `ready`              | Same queue; this household has no agent-only lane              |
| `wontfix`                  | `wontfix`            | Will not be actioned; moves to the parking lot if it is an idea |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Additional labels used by the workflow (Plan §7.3)

These are not triage roles; they describe kind and state and coexist with the roles above.

| Label         | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `spec`        | The epic issue produced by `/to-spec`                                 |
| `in-progress` | A branch exists and work has started                                  |
| `bug`         | Regression or defect; first commit on its branch is a failing test    |
| `design`      | UI work; PR needs both-mode screenshots and the pre-flight in DESIGN.md |
| `chore`       | Tooling, CI, dependencies, docs                                       |
| `good-first`  | Small, well-scoped, safe for a first contribution                     |
