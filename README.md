# instachores-app

HomeCrew: a household chores PWA that makes the daily grind count. Two taps to log a task, one calm household bar, points that turn into solo rest.

- **Plan**: [`docs/Plan.md`](docs/Plan.md)
- **Architecture**: [`docs/Architecture.md`](docs/Architecture.md), decisions in [`docs/adr/`](docs/adr/)
- **Design**: [`docs/design/DESIGN.md`](docs/design/DESIGN.md)
- **Agent config**: [`docs/agents/`](docs/agents/), skills in [`.claude/skills/`](.claude/skills/)
- **Testing loop**: [`docs/Testing.md`](docs/Testing.md)
- **Household setup**: [`docs/Setup.md`](docs/Setup.md), the ten-minute procedure to create a real household sheet, deploy the script and seed the catalog
- **Process**: [`docs/Process.md`](docs/Process.md)
- **Working rules**: [`CLAUDE.md`](CLAUDE.md)

```bash
npm install
npm run test:watch   # red, green, refactor
npm run check        # lint + format check + typecheck + tests with coverage gates (same as CI)
```

Format-on-save: install the ESLint, Prettier and Stylelint VS Code extensions (recommended in `.vscode/extensions.json`) and enable `editor.formatOnSave`.

## Deploy

The app is served from GitHub Pages, source is the `gh-pages` branch, root. Set this once: **Settings > Pages > Source: Deploy from a branch**, branch `gh-pages`, folder `/ (root)`.

- `deploy.yml` runs on every push to `main`: typecheck, lint and tests (`npm run check`) must pass before it builds and publishes `dist/` to the branch root. Merging to `main` is the only step; the app updates at `https://roughee.github.io/instachores-app/` within a few minutes.
- `preview.yml` runs on every pull request: it builds with `VITE_BASE=/instachores-app/pr-<n>/` so the app's asset paths and hash router agree with the subfolder it is published to, publishes under `pr-<n>/` on the same `gh-pages` branch, and posts (or updates) a comment on the PR with the preview URL: `https://roughee.github.io/instachores-app/pr-<n>/#/log`. Always use that trailing slash before `#/log`, a request for `pr-<n>` without it 404s before the app's own hash routing gets a chance to run. Closing or merging the PR removes its `pr-<n>/` folder and updates the comment.
- Both jobs publish with `keep_files: true` so the main build and every preview coexist as separate directories on one `gh-pages` branch instead of overwriting each other.
