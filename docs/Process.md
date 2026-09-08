# Process

Short reference for the mechanics of shipping a change. Product process and the full ticket workflow are in `docs/Plan.md` §7.

## Labels

From `docs/agents/triage-labels.md` (Plan §7.3):

| Label | Meaning |
| --- | --- |
| `needs-spec` | New idea or bug; needs a `/grill-with-docs` pass before a spec |
| `blocked` | Waiting on the reporter, a decision, or another ticket |
| `ready` | Fully specified ticket with red-first tests named; buildable |
| `wontfix` | Will not be actioned |
| `spec` | The epic issue produced by `/to-spec` |
| `in-progress` | A branch exists and work has started |
| `bug` | Regression or defect; first commit on its branch is a failing test |
| `design` | UI work; PR needs both-mode screenshots and the pre-flight in DESIGN.md |
| `chore` | Tooling, CI, dependencies, docs |
| `good-first` | Small, well-scoped, safe for a first contribution |

## Branch naming

`feat/123-short-name`, `fix/140-dst-week-boundary`, `chore/123-short-name`, `design/123-short-name`. The number is the ticket's issue number.

## Branch protection (set by a maintainer in GitHub, not in this repo)

On `main`:

- pull request required to merge, no direct pushes
- 1 approving review required
- required status check: `check` (the ci workflow's job)
- branch must be up to date before merging
- squash merge only
- linear history required

## Deploy

Merging to `main` is the deploy: `deploy.yml` publishes `dist/` to the `gh-pages` branch once `npm run check` passes, and `preview.yml` publishes each open PR under `pr-<n>/` on the same branch until it closes (see the README's Deploy section for the URLs and settings).

## Squash commit message format

Conventional Commits, matching the PR title used at merge time:

```
feat(log): quick row logging (#123)
fix(week): week boundary uses household tz across DST (#140)
chore(ci): add coverage upload step (#87)
```
