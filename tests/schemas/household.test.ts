import { describe, expect, it } from 'vitest'
import { Backup, Household, Member, Reward, decodeSetupLink, encodeSetupLink } from '@/schemas'
import { household, reward, task } from '../helpers/fixtures'

describe('Member and Household schemas', () => {
  it('requires a hex color and a role', () => {
    expect(Member.safeParse({ uid: 'ana', name: 'Ana', color: 'teal', role: 'adult' }).success).toBe(false)
    expect(Member.safeParse({ uid: 'ana', name: 'Ana', color: '#1F8A70', role: 'parent' }).success).toBe(false)
  })

  it('requires a positive weekly target and a timezone', () => {
    const h = household()
    expect(Household.safeParse({ ...h, weeklyTarget: 0 }).success).toBe(false)
    expect(Household.safeParse({ ...h, tz: '' }).success).toBe(false)
  })

  it('reads a weekly target written as text in the sheet', () => {
    expect(Household.parse({ ...household(), weeklyTarget: '250' }).weeklyTarget).toBe(250)
  })
})

describe('Reward schema', () => {
  it('requires a positive cost and a known kind', () => {
    const r = reward()
    expect(Reward.safeParse({ ...r, cost: 0 }).success).toBe(false)
    expect(Reward.safeParse({ ...r, kind: 'gold' }).success).toBe(false)
  })
})

describe('Backup schema', () => {
  it('reports the path of a broken event instead of failing silently', () => {
    const result = Backup.safeParse({
      v: 1,
      exportedAt: '2026-09-09T18:00:00.000Z',
      household: household(),
      tasks: [task()],
      rewards: [reward()],
      events: [{ v: 1, id: 'ev-1', type: 'complete' }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'events' && i.path[1] === 0)).toBe(true)
    }
  })
})

describe('Setup link', () => {
  const link = { url: 'https://script.google.com/macros/s/abc/exec', secret: 'correct-horse-battery' }

  it('encodes to a URL-safe string and decodes back to the same link', () => {
    const encoded = encodeSetupLink(link)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeSetupLink(encoded)).toEqual(link)
  })

  it('rejects garbage, a non-https url and a short secret', () => {
    expect(() => decodeSetupLink('not-base64!!')).toThrow()
    expect(() => decodeSetupLink(encodeSetupLink({ url: 'http://example.com', secret: 'correct-horse-battery' }))).toThrow()
    expect(() => decodeSetupLink(encodeSetupLink({ ...link, secret: 'short' }))).toThrow()
  })
})
