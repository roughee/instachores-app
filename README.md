# instachores-app

HomeCrew: a household chores PWA that makes the daily grind count. Two taps to log a task, one calm household bar, points that turn into solo rest.

- **Plan**: [`docs/Plan.md`](docs/Plan.md)
- **Architecture**: [`docs/Architecture.md`](docs/Architecture.md), decisions in [`docs/adr/`](docs/adr/)
- **Design**: [`docs/design/DESIGN.md`](docs/design/DESIGN.md)
- **Agent config**: [`docs/agents/`](docs/agents/), skills in [`.claude/skills/`](.claude/skills/)
- **Testing loop**: [`docs/Testing.md`](docs/Testing.md)
- **Working rules**: [`CLAUDE.md`](CLAUDE.md)

```bash
npm install
npm run test:watch   # red, green, refactor
npm run check        # typecheck + tests with coverage gates (same as CI)
```
