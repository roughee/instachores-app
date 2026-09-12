/**
 * Pure parts of scripts/household.ts (issue #13): argument parsing, member
 * row validation and formatting, setup-link building, and the check-result
 * evaluation given fake responses. IO (fetch, stdin, process.exit) lives in
 * the script's `cmd*` functions and `main()`, which are not exercised here —
 * see docs/Setup.md for the manual procedure that runs them for real.
 */
import { describe, expect, it } from 'vitest'
import {
  buildSeedPayload,
  buildSetupLinkUrl,
  checkScheduleColumns,
  describeSeedRefusal,
  evaluateCheckResults,
  flagValue,
  flagValues,
  formatMembersTable,
  formatSeedDryRun,
  generateSecret,
  hasFlag,
  normalizeAppUrl,
  parseArgv,
  parseMemberSpec,
  resolveSecret,
} from '../../scripts/household.ts'
import { SEED_IDS } from '../../src/domain/seed.ts'

describe('parseArgv', () => {
  it('reads the command and single-valued flags', () => {
    const args = parseArgv(['check', '--url', 'https://example.invalid/exec', '--secret', 's3cr3t'])

    expect(args.command).toBe('check')
    expect(flagValue(args, 'url')).toBe('https://example.invalid/exec')
    expect(flagValue(args, 'secret')).toBe('s3cr3t')
  })

  it('collects a repeated flag in order', () => {
    const args = parseArgv(['members', '--adult', 'ana:Ana:#128369', '--adult', 'ben:Ben:#3f6fd4'])

    expect(flagValues(args, 'adult')).toEqual(['ana:Ana:#128369', 'ben:Ben:#3f6fd4'])
  })

  it('treats a flag with no value (end of input, or followed by another flag) as a boolean switch', () => {
    const atEnd = parseArgv(['seed', '--url', 'https://example.invalid', '--dry-run'])
    const beforeAnotherFlag = parseArgv(['seed', '--dry-run', '--url', 'https://example.invalid'])

    expect(hasFlag(atEnd, 'dry-run')).toBe(true)
    expect(flagValue(atEnd, 'dry-run')).toBe('true')
    expect(hasFlag(beforeAnotherFlag, 'dry-run')).toBe(true)
  })

  it('has no command when argv is empty', () => {
    expect(parseArgv([]).command).toBeUndefined()
  })

  it('answers false for a flag never passed', () => {
    const args = parseArgv(['secret'])

    expect(hasFlag(args, 'url')).toBe(false)
    expect(flagValue(args, 'url')).toBeUndefined()
    expect(flagValues(args, 'adult')).toEqual([])
  })
})

describe('resolveSecret', () => {
  it('prefers the --secret flag over the environment', () => {
    expect(resolveSecret('from-flag', { HOMECREW_SECRET: 'from-env' })).toBe('from-flag')
  })

  it('falls back to HOMECREW_SECRET when no flag was given', () => {
    expect(resolveSecret(undefined, { HOMECREW_SECRET: 'from-env' })).toBe('from-env')
  })

  it('throws a readable error when neither is set', () => {
    expect(() => resolveSecret(undefined, {})).toThrow(/HOMECREW_SECRET/)
  })
})

describe('generateSecret', () => {
  it('is a 32-character base64url string', () => {
    const secret = generateSecret()

    expect(secret).toHaveLength(32)
    expect(secret).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it('is different on every call', () => {
    expect(generateSecret()).not.toBe(generateSecret())
  })
})

describe('parseMemberSpec', () => {
  it('parses a valid uid:Name:#hex spec into a Member', () => {
    const member = parseMemberSpec('ana:Ana:#128369', 'adult')

    expect(member).toEqual({ uid: 'ana', name: 'Ana', color: '#128369', role: 'adult' })
  })

  it('rejects a spec with the wrong number of parts', () => {
    expect(() => parseMemberSpec('ana:Ana', 'adult')).toThrow(/uid:Name:#hex/)
  })

  it('rejects a spec whose color is not a hex color', () => {
    expect(() => parseMemberSpec('ana:Ana:blue', 'adult')).toThrow(/ana:Ana:blue/)
  })

  it('rejects a spec with an empty name', () => {
    expect(() => parseMemberSpec('ana::#128369', 'adult')).toThrow()
  })

  it('sets the role from the argument, not the spec', () => {
    const member = parseMemberSpec('mia:Mia:#c9508c', 'kid')

    expect(member.role).toBe('kid')
  })
})

describe('formatMembersTable', () => {
  it('renders a tab-separated header and one row per member, in sheet column order', () => {
    const table = formatMembersTable([
      { uid: 'ana', name: 'Ana', color: '#128369', role: 'adult' },
      { uid: 'mia', name: 'Mia', color: '#c9508c', role: 'kid' },
    ])

    expect(table).toBe(['uid\tname\tcolor\trole', 'ana\tAna\t#128369\tadult', 'mia\tMia\t#c9508c\tkid'].join('\n'))
  })

  it('renders just the header for an empty list', () => {
    expect(formatMembersTable([])).toBe('uid\tname\tcolor\trole')
  })
})

describe('normalizeAppUrl', () => {
  it('adds a trailing slash when missing', () => {
    expect(normalizeAppUrl('https://roughee.github.io/instachores-app')).toBe(
      'https://roughee.github.io/instachores-app/',
    )
  })

  it('leaves an existing trailing slash alone', () => {
    expect(normalizeAppUrl('https://roughee.github.io/instachores-app/')).toBe(
      'https://roughee.github.io/instachores-app/',
    )
  })
})

describe('buildSetupLinkUrl', () => {
  it('builds a #/welcome link carrying the base64url-encoded url and secret', () => {
    const link = buildSetupLinkUrl(
      'https://script.google.com/macros/s/abc/exec',
      'a-secret-value-123',
      'https://example.io/app/',
    )

    expect(link).toMatch(/^https:\/\/example\.io\/app\/#\/welcome\?s=[A-Za-z0-9_-]+$/)
  })

  it('defaults the app to the deployed GitHub Pages URL', () => {
    const link = buildSetupLinkUrl('https://script.google.com/macros/s/abc/exec', 'a-secret-value-123')

    expect(link.startsWith('https://roughee.github.io/instachores-app/#/welcome?s=')).toBe(true)
  })

  it('round-trips through decodeSetupLink', async () => {
    const { decodeSetupLink } = await import('@/schemas')
    const url = 'https://script.google.com/macros/s/abc/exec'
    const secret = 'a-secret-value-123'

    const link = buildSetupLinkUrl(url, secret)
    const encoded = link.split('s=')[1]!

    expect(decodeSetupLink(encoded)).toEqual({ url, secret })
  })

  it('rejects a secret that is too short to be a real household secret', () => {
    expect(() => buildSetupLinkUrl('https://script.google.com/macros/s/abc/exec', 'short')).toThrow()
  })

  it('rejects a non-https script url', () => {
    expect(() => buildSetupLinkUrl('http://script.google.com/macros/s/abc/exec', 'a-secret-value-123')).toThrow()
  })
})

describe('evaluateCheckResults', () => {
  it('passes both checks when the right secret is accepted and the wrong one is rejected', () => {
    const summary = evaluateCheckResults({ ok: true, version: '1.0.0' }, { ok: false, code: 'unauthorized' })

    expect(summary.allPass).toBe(true)
    expect(summary.outcomes.every((o) => o.ok)).toBe(true)
  })

  it('fails the first check when the right secret is rejected', () => {
    const summary = evaluateCheckResults({ ok: false, code: 'unauthorized' }, { ok: false, code: 'unauthorized' })

    expect(summary.allPass).toBe(false)
    expect(summary.outcomes[0]!.ok).toBe(false)
    expect(summary.outcomes[1]!.ok).toBe(true)
  })

  it('fails the second check when a wrong secret is accepted anyway', () => {
    const summary = evaluateCheckResults({ ok: true, version: '1.0.0' }, { ok: true, version: '1.0.0' })

    expect(summary.allPass).toBe(false)
    expect(summary.outcomes[1]!.ok).toBe(false)
  })

  it('fails on a malformed or missing response instead of throwing', () => {
    const summary = evaluateCheckResults(undefined, null)

    expect(summary.allPass).toBe(false)
    expect(() => evaluateCheckResults(undefined, null)).not.toThrow()
  })
})

describe('buildSeedPayload', () => {
  it('builds the full seed catalog stamped with the given time and author', () => {
    const now = new Date('2026-09-08T00:00:00.000Z')
    const payload = buildSeedPayload(now, 'setup')

    expect(payload.tasks.length).toBeGreaterThan(0)
    expect(payload.rewards.length).toBeGreaterThan(0)
    expect(payload.tasks.every((t) => t.updatedBy === 'setup')).toBe(true)
    expect(payload.tasks.every((t) => t.updatedAt.getTime() === now.getTime())).toBe(true)
  })

  it('carries intervalDays for the seed rows that have one, and serializes it as a plain number over the wire (issue #67)', () => {
    const now = new Date('2026-09-08T00:00:00.000Z')
    const payload = buildSeedPayload(now, 'setup')

    const fridge = payload.tasks.find((t) => t.id === SEED_IDS.fridge)
    const pots = payload.tasks.find((t) => t.id === SEED_IDS.pots)
    expect(fridge?.intervalDays).toBe(14)
    expect(pots?.intervalDays).toBeUndefined()

    // buildSeedPayload's result is exactly what postAction JSON.stringifies
    // and sends as the seed action's body: a Date's own toJSON() -> ISO
    // string, a plain number stays a number (Architecture §5's seed action,
    // not the sheet's plain-text cells, which apps-script/Code.js writes on
    // its own side).
    const overWire = JSON.parse(JSON.stringify(payload)) as { tasks: { id: string; intervalDays?: number }[] }
    const fridgeOverWire = overWire.tasks.find((t) => t.id === SEED_IDS.fridge)
    expect(fridgeOverWire?.intervalDays).toBe(14)
    expect(typeof fridgeOverWire?.intervalDays).toBe('number')
  })
})

describe('checkScheduleColumns', () => {
  it('reports a column present when at least one returned row carries the key', () => {
    const result = checkScheduleColumns({
      tasks: [{ id: 't1', intervalDays: 14 }],
      events: [{ id: 'e1', dueAt: '2026-09-23T00:00:00.000Z', days: 14 }],
    })

    expect(result).toEqual([
      { column: 'tasks.intervalDays', status: 'present' },
      { column: 'events.dueAt', status: 'present' },
      { column: 'events.days', status: 'present' },
    ])
  })

  it('reports a column present even when every row has it blank, since the key itself still shows up', () => {
    const result = checkScheduleColumns({
      tasks: [{ id: 't1', intervalDays: '' }],
      events: [{ id: 'e1', dueAt: '', days: '' }],
    })

    expect(result.every((c) => c.status === 'present')).toBe(true)
  })

  it('reports a column missing when rows exist but none carries the key', () => {
    const result = checkScheduleColumns({
      tasks: [{ id: 't1' }],
      events: [{ id: 'e1' }],
    })

    expect(result).toEqual([
      { column: 'tasks.intervalDays', status: 'missing' },
      { column: 'events.dueAt', status: 'missing' },
      { column: 'events.days', status: 'missing' },
    ])
  })

  it('reports unknown, not missing, when there are no rows to check at all', () => {
    const result = checkScheduleColumns({ tasks: [], events: [] })

    expect(result.every((c) => c.status === 'unknown')).toBe(true)
  })
})

describe('formatSeedDryRun', () => {
  it('reports the counts and previews the first three rows of each tab', () => {
    const payload = buildSeedPayload(new Date('2026-09-08T00:00:00.000Z'), 'setup')

    const out = formatSeedDryRun(payload)

    expect(out).toContain(`tasks: ${payload.tasks.length}`)
    expect(out).toContain(`rewards: ${payload.rewards.length}`)
    expect(out).toContain(payload.tasks[0]!.id)
    expect(out).toContain(payload.tasks[1]!.id)
    expect(out).toContain(payload.tasks[2]!.id)
    expect(out).not.toContain(payload.tasks[3]!.id)
    expect(out).toContain(payload.rewards[0]!.id)
    expect(out).not.toContain(payload.rewards[3]!.id)
  })
})

describe('describeSeedRefusal', () => {
  it('explains the tabs must be empty and includes the script message', () => {
    const message = describeSeedRefusal({ code: 'invalid', message: 'tasks and rewards must be empty to seed' })

    expect(message).toContain('tasks and/or rewards tab already has rows')
    expect(message).toContain('tasks and rewards must be empty to seed')
  })

  it('still reads well when the script sent no message', () => {
    const message = describeSeedRefusal({ code: 'invalid' })

    expect(message).toContain('already has rows')
  })
})
