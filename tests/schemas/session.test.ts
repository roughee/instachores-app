import { describe, expect, it } from 'vitest'
import { Session } from '@/schemas'

const LINK = { url: 'https://script.google.com/macros/s/abc/exec', secret: 'x'.repeat(12) }

describe('Session schema', () => {
  it('accepts a full valid session', () => {
    const s = Session.parse({ v: 1, link: LINK, householdId: 'hh-1', memberUid: 'ana' })
    expect(s.householdId).toBe('hh-1')
    expect(s.memberUid).toBe('ana')
    expect(s.link).toEqual(LINK)
  })

  it('rejects a session missing the link', () => {
    expect(Session.safeParse({ v: 1, householdId: 'hh-1', memberUid: 'ana' }).success).toBe(false)
  })

  it('rejects an empty memberUid', () => {
    expect(Session.safeParse({ v: 1, link: LINK, householdId: 'hh-1', memberUid: '' }).success).toBe(false)
  })

  it('rejects a link whose url is not https', () => {
    expect(
      Session.safeParse({ v: 1, link: { ...LINK, url: 'http://x.com/exec' }, householdId: 'hh-1', memberUid: 'ana' })
        .success,
    ).toBe(false)
  })

  it('rejects a non-literal version', () => {
    expect(Session.safeParse({ v: 2, link: LINK, householdId: 'hh-1', memberUid: 'ana' }).success).toBe(false)
  })

  it('round-trips through JSON, the shape localStorage stores it in', () => {
    const s = Session.parse({ v: 1, link: LINK, householdId: 'hh-1', memberUid: 'ana' })
    const revived = Session.parse(JSON.parse(JSON.stringify(s)))
    expect(revived).toEqual(s)
  })
})
