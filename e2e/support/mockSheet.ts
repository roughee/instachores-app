/**
 * A tiny in-memory stand-in for the Apps Script web app (issue #22,
 * Architecture.md §5), answering exactly the actions the client sends:
 * `bootstrap`, `events.since`, `events.append`, `version`. It mirrors
 * `apps-script/Code.js`'s request/response shapes (`{ ok: true, ...result }`
 * / `{ ok: false, code, message }`), not its sheet mechanics (locking,
 * plain-text cells) -- the client only ever sees the JSON.
 *
 * One `MockSheet` instance is routed into every `BrowserContext` that needs
 * it, so two "phones" (two contexts) talking to the same instance see each
 * other's appended events, the same as two real phones sharing one sheet.
 *
 * `sheet.offline` simulates a dropped connection for the *mocked* endpoint:
 * `context.setOffline(true)` alone is not enough for a routed request --
 * Playwright's route interception answers a request before it would reach
 * the (simulated) network, so a `route.fulfill()` still succeeds while the
 * context is "offline". Set `sheet.offline = true` alongside
 * `context.setOffline(true)` to also make the mocked script unreachable;
 * `context.setOffline` is still what is needed for `navigator.onLine` and
 * the `online`/`offline` window events `SheetsRepo` listens for.
 */
import type { BrowserContext, Route } from '@playwright/test'
import { encodeSetupLink } from '@/schemas'
import type { SetupLink } from '@/schemas'

export const MOCK_URL = 'https://sheet.mock.test/exec'
export const MOCK_SECRET = 'e2e-mock-secret-not-a-real-one'
export const MOCK_HOUSEHOLD_ID = 'hh-e2e'

/** Raw, unparsed rows -- the shape a sheet row would arrive as, same as
 * `MemoryRepoSeed` in `src/data/repo.ts`. Left loose on purpose: the real
 * proof that a row is well-shaped is the client's own `safeParse`. */
export type RawRow = Record<string, unknown>

interface RequestBody {
  secret?: string
  action?: string
  since?: string
  events?: RawRow[]
  [key: string]: unknown
}

export interface AppendCall {
  events: RawRow[]
}

export class MockSheet {
  private readonly members: RawRow[]
  private readonly tasks: RawRow[]
  private readonly rewards: RawRow[]
  private readonly events: RawRow[] = []
  /** Every `events.append` call received, in order -- what the tests assert against. */
  readonly appendCalls: AppendCall[] = []
  /** See the module doc comment: makes `routeMockSheet` abort instead of answering. */
  offline = false

  constructor(opts: { members: RawRow[]; tasks: RawRow[]; rewards?: RawRow[] }) {
    this.members = opts.members
    this.tasks = opts.tasks
    this.rewards = opts.rewards ?? []
  }

  /** Every event id ever appended (including a duplicate's first arrival), oldest call first. */
  get appendedEventIds(): string[] {
    return this.appendCalls.flatMap((c) => c.events.map((e) => e.id as string))
  }

  private household(): RawRow {
    return {
      v: 1,
      id: MOCK_HOUSEHOLD_ID,
      name: 'Test Household',
      weeklyTarget: 250,
      tz: 'UTC',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
  }

  /** Mirrors `eventsSince` in `apps-script/Code.js`: `loggedAt >= since - 1s`, so a row appended in the same second as the cursor is never missed. */
  private eventsSince(since: string | undefined): RawRow[] {
    const cutoff = since ? new Date(since).getTime() - 1000 : 0
    return this.events
      .filter((e) => new Date(e.loggedAt as string).getTime() >= cutoff)
      .sort((a, b) => new Date(a.loggedAt as string).getTime() - new Date(b.loggedAt as string).getTime())
  }

  private appendEvents(incoming: RawRow[]): { appended: string[]; skipped: string[] } {
    this.appendCalls.push({ events: incoming })
    const existing = new Set(this.events.map((e) => e.id as string))
    const loggedAt = new Date().toISOString()
    const appended: string[] = []
    const skipped: string[] = []
    for (const ev of incoming) {
      const id = ev.id as string
      if (existing.has(id)) {
        skipped.push(id)
        continue
      }
      this.events.push({ ...ev, loggedAt })
      existing.add(id)
      appended.push(id)
    }
    return { appended, skipped }
  }

  /** Answers one `{ secret, action, ...params }` request, the way `handleRequest` in `apps-script/Code.js` does. */
  handle(body: RequestBody): RawRow {
    if (body.secret !== MOCK_SECRET) return { ok: false, code: 'unauthorized' }
    switch (body.action) {
      case 'bootstrap':
        return {
          ok: true,
          household: this.household(),
          members: this.members,
          tasks: this.tasks,
          rewards: this.rewards,
          events: this.eventsSince(body.since),
          serverTime: new Date().toISOString(),
        }
      case 'events.since':
        return { ok: true, events: this.eventsSince(body.since), serverTime: new Date().toISOString() }
      case 'events.append': {
        const { appended, skipped } = this.appendEvents(Array.isArray(body.events) ? body.events : [])
        return { ok: true, appended, skipped, loggedAt: new Date().toISOString() }
      }
      case 'version':
        return { ok: true, version: 'e2e-mock-1' }
      default:
        return { ok: false, code: 'invalid', message: `unknown action: ${String(body.action)}` }
    }
  }
}

/** Routes every POST to `MOCK_URL` in `context` to `sheet.handle(...)`. */
export async function routeMockSheet(context: BrowserContext, sheet: MockSheet): Promise<void> {
  await context.route(MOCK_URL, async (route: Route) => {
    const request = route.request()
    if (request.method() !== 'POST') {
      await route.continue()
      return
    }
    if (sheet.offline) {
      await route.abort('internetdisconnected')
      return
    }
    let body: RequestBody
    try {
      body = JSON.parse(request.postData() ?? '{}') as RequestBody
    } catch {
      body = {}
    }
    const result = sheet.handle(body)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
  })
}

export function mockSetupLink(): SetupLink {
  return { url: MOCK_URL, secret: MOCK_SECRET }
}

/** The `s=` token for `#/welcome?s=<token>`, encoding `mockSetupLink()`. */
export function mockSetupLinkToken(): string {
  return encodeSetupLink(mockSetupLink())
}
