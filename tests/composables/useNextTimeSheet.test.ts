import { describe, expect, it } from 'vitest'
import { useNextTimeSheet } from '@/composables/useNextTimeSheet'
import { NOW, TZ, task } from '../helpers/fixtures'

function payloadFor(overrides: Partial<Parameters<typeof task>[0]> = {}) {
  return {
    task: task({ name: 'Pots', ...overrides }),
    completeEventId: 'ev-1',
    points: 2,
    memberName: 'Ana',
    completedAt: NOW,
    tz: TZ,
    categoryLabel: 'Kitchen',
  }
}

describe('useNextTimeSheet', () => {
  it('starts closed', () => {
    const sheet = useNextTimeSheet()
    expect(sheet.payload.value).toBeUndefined()
  })

  it('open stores the payload for an adult task', () => {
    const sheet = useNextTimeSheet()
    const payload = payloadFor()
    sheet.open(payload)
    expect(sheet.payload.value).toEqual(payload)
  })

  it('never opens for a kid task (Plan §5.5)', () => {
    const sheet = useNextTimeSheet()
    sheet.open(payloadFor({ forRole: 'kid' }))
    expect(sheet.payload.value).toBeUndefined()
  })

  it('opens even when the task has no suggested interval (adhoc, no override)', () => {
    const sheet = useNextTimeSheet()
    const payload = payloadFor({ freq: 'adhoc' })
    sheet.open(payload)
    expect(sheet.payload.value).toEqual(payload)
  })

  it('close clears the payload', () => {
    const sheet = useNextTimeSheet()
    sheet.open(payloadFor())
    sheet.close()
    expect(sheet.payload.value).toBeUndefined()
  })
})
