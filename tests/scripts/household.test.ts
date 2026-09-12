/**
 * Pure parts of scripts/household.ts (issue #13): argument parsing, member
 * row validation and formatting, setup-link building, and the check-result
 * evaluation given fake responses. IO (fetch, stdin, process.exit) lives in
 * the script's `cmd*` functions and `main()`, which are not exercised here —
 * see docs/Setup.md for the manual procedure that runs them for real.
 */
import { describe, expect, it, vi } from 'vitest'
import type { ActionResponse } from '../../scripts/household.ts'
import {
  buildSeedPayload,
  buildSetupLinkUrl,
  checkScheduleColumns,
  describeSeedRefusal,
  evaluateCheckResults,
  flagValue,
  flagValues,
  formatAppendDryRun,
  formatMembersTable,
  formatSeedDryRun,
  generateSecret,
  hasFlag,
  missingSeedRows,
  normalizeAppUrl,
  parseArgv,
  parseMemberSpec,
  resolveSecret,
  runSeedAppend,
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

  it('points at --append as the way to add the missing rows instead', () => {
    const message = describeSeedRefusal({ code: 'invalid' })

    expect(message).toContain('--append')
  })
})

// ---------------------------------------------------------------------------
// missingSeedRows / formatAppendDryRun / runSeedAppend (issue #83)
// ---------------------------------------------------------------------------

const NOW = new Date('2026-09-08T00:00:00.000Z')

function bootstrapOf(taskIds: string[], rewardIds: string[]): { tasks: unknown[]; rewards: unknown[] } {
  return {
    tasks: taskIds.map((id) => ({ id })),
    rewards: rewardIds.map((id) => ({ id })),
  }
}

describe('missingSeedRows', () => {
  it('returns every seed row when the sheet is empty', () => {
    const payload = buildSeedPayload(NOW, 'setup')

    const missing = missingSeedRows(bootstrapOf([], []), payload)

    expect(missing.tasks).toEqual(payload.tasks)
    expect(missing.rewards).toEqual(payload.rewards)
  })

  it('returns nothing when the sheet already has every seed row', () => {
    const payload = buildSeedPayload(NOW, 'setup')

    const missing = missingSeedRows(
      bootstrapOf(
        payload.tasks.map((t) => t.id),
        payload.rewards.map((r) => r.id),
      ),
      payload,
    )

    expect(missing.tasks).toEqual([])
    expect(missing.rewards).toEqual([])
  })

  it('returns exactly the missing rows, in seed order, for a partially seeded sheet', () => {
    const payload = buildSeedPayload(NOW, 'setup')
    const presentTaskIds = [payload.tasks[0]!.id, payload.tasks[2]!.id]
    const presentRewardIds = [payload.rewards[1]!.id]

    const missing = missingSeedRows(bootstrapOf(presentTaskIds, presentRewardIds), payload)

    const expectedTasks = payload.tasks.filter((t) => !presentTaskIds.includes(t.id))
    const expectedRewards = payload.rewards.filter((r) => !presentRewardIds.includes(r.id))
    expect(missing.tasks).toEqual(expectedTasks)
    expect(missing.tasks.map((t) => t.id)).not.toContain(payload.tasks[0]!.id)
    expect(missing.tasks.map((t) => t.id)).not.toContain(payload.tasks[2]!.id)
    expect(missing.rewards).toEqual(expectedRewards)
  })

  it('skips sheet rows without an id instead of treating them as present or throwing', () => {
    const payload = buildSeedPayload(NOW, 'setup')
    const bootstrap = { tasks: [{ name: 'no id here' }, {}], rewards: [{ points: 5 }] }

    const missing = missingSeedRows(bootstrap, payload)

    expect(missing.tasks).toEqual(payload.tasks)
    expect(missing.rewards).toEqual(payload.rewards)
  })

  it('ignores sheet ids that are not in the seed payload', () => {
    const payload = buildSeedPayload(NOW, 'setup')

    const missing = missingSeedRows(bootstrapOf(['some-old-task-id'], ['some-old-reward-id']), payload)

    expect(missing.tasks).toEqual(payload.tasks)
    expect(missing.rewards).toEqual(payload.rewards)
  })
})

describe('formatAppendDryRun', () => {
  it('groups missing tasks by category, lists rewards, and reports the counts', () => {
    const payload = buildSeedPayload(NOW, 'setup')
    const breakfast = payload.tasks.find((t) => t.id === SEED_IDS.makeBreakfast)!
    const washCycle = payload.tasks.find((t) => t.id === SEED_IDS.washCycle)!
    const reward = payload.rewards[0]!

    const out = formatAppendDryRun({ tasks: [breakfast, washCycle], rewards: [reward] })

    expect(out).toContain('kitchen:')
    expect(out).toContain(`+ ${breakfast.name} (kitchen, ${breakfast.points} pts)`)
    expect(out).toContain('laundry:')
    expect(out).toContain(`+ ${washCycle.name} (laundry, ${washCycle.points} pts)`)
    expect(out).toContain('rewards:')
    expect(out).toContain(`+ ${reward.name} (${reward.cost} pts)`)
    expect(out).toContain('2 missing tasks, 1 missing rewards')
  })

  it('reports zero counts and no group headers for nothing missing', () => {
    const out = formatAppendDryRun({ tasks: [], rewards: [] })

    expect(out).toContain('0 missing tasks, 0 missing rewards')
    expect(out).not.toContain('rewards:')
  })
})

describe('runSeedAppend', () => {
  const url = 'https://example.invalid/exec'
  const secret = 's3cr3t'

  function fakePost(bootstrap: { tasks: unknown[]; rewards: unknown[] }, failOn?: string) {
    return vi.fn(async (_url: string, _secret: string, action: string): Promise<ActionResponse> => {
      if (action === 'bootstrap') return { ok: true, ...bootstrap }
      if (action === failOn) return { ok: false, code: 'invalid', message: `bad row for ${action}` }
      return { ok: true }
    })
  }

  it('posts bootstrap, then one tasks.upsert/rewards.upsert per missing row, in seed order, with --yes', async () => {
    const payload = buildSeedPayload(NOW, 'setup')
    const missingTasks = payload.tasks.slice(-2)
    const missingRewards = payload.rewards.slice(-1)
    const presentTaskIds = payload.tasks.slice(0, -2).map((t) => t.id)
    const presentRewardIds = payload.rewards.slice(0, -1).map((r) => r.id)
    const post = fakePost({
      tasks: presentTaskIds.map((id) => ({ id })),
      rewards: presentRewardIds.map((id) => ({ id })),
    })
    const logs: string[] = []

    const code = await runSeedAppend(
      url,
      secret,
      payload,
      { dryRun: false, yes: true },
      { post, confirm: () => Promise.reject(new Error('should not ask with --yes')), log: (l) => logs.push(l) },
    )

    expect(code).toBe(0)
    expect(post).toHaveBeenNthCalledWith(1, url, secret, 'bootstrap')
    missingTasks.forEach((task, i) => {
      expect(post).toHaveBeenNthCalledWith(2 + i, url, secret, 'tasks.upsert', { task })
    })
    missingRewards.forEach((reward, i) => {
      expect(post).toHaveBeenNthCalledWith(2 + missingTasks.length + i, url, secret, 'rewards.upsert', { reward })
    })
    expect(post).toHaveBeenCalledTimes(1 + missingTasks.length + missingRewards.length)
    expect(logs.join('\n')).toContain(`+ ${missingTasks[0]!.name}`)
  })

  it('stops at the first failed upsert, reports it, and exits 1 without posting the rest', async () => {
    const payload = buildSeedPayload(NOW, 'setup')
    const post = fakePost({ tasks: [], rewards: payload.rewards.map((r) => ({ id: r.id })) }, 'tasks.upsert')
    const errors: string[] = []

    const code = await runSeedAppend(
      url,
      secret,
      payload,
      { dryRun: false, yes: true },
      { post, confirm: () => Promise.reject(new Error('should not ask with --yes')), error: (l) => errors.push(l) },
    )

    expect(code).toBe(1)
    // bootstrap + exactly one failed tasks.upsert call, nothing after it
    expect(post).toHaveBeenCalledTimes(2)
    expect(errors.join('\n')).toContain(payload.tasks[0]!.id)
    expect(errors.join('\n')).toContain('invalid')
  })

  it('exits 0 with no upsert calls when nothing is missing', async () => {
    const payload = buildSeedPayload(NOW, 'setup')
    const post = fakePost({
      tasks: payload.tasks.map((t) => ({ id: t.id })),
      rewards: payload.rewards.map((r) => ({ id: r.id })),
    })
    const logs: string[] = []

    const code = await runSeedAppend(
      url,
      secret,
      payload,
      { dryRun: false, yes: false },
      {
        post,
        confirm: () => Promise.reject(new Error('should not ask when nothing is missing')),
        log: (l) => logs.push(l),
      },
    )

    expect(code).toBe(0)
    expect(post).toHaveBeenCalledTimes(1)
    expect(logs.join('\n')).toContain('Nothing to add: the sheet already has every seed row.')
  })

  it('prints the dry-run report and exits 0 without posting any upsert', async () => {
    const payload = buildSeedPayload(NOW, 'setup')
    const post = fakePost({ tasks: [], rewards: [] })
    const logs: string[] = []

    const code = await runSeedAppend(
      url,
      secret,
      payload,
      { dryRun: true, yes: false },
      { post, confirm: () => Promise.reject(new Error('should not ask on --dry-run')), log: (l) => logs.push(l) },
    )

    expect(code).toBe(0)
    expect(post).toHaveBeenCalledTimes(1)
    expect(logs.join('\n')).toContain(
      `${payload.tasks.length} missing tasks, ${payload.rewards.length} missing rewards`,
    )
  })
})
