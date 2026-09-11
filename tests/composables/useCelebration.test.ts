import { beforeEach, describe, expect, it } from 'vitest'
import { CELEBRATION_IDS, createCelebrationState, pickCelebration, useCelebration } from '@/composables/useCelebration'

describe('pickCelebration', () => {
  it('returns one of the ten ids', () => {
    for (let i = 0; i < CELEBRATION_IDS.length; i++) {
      const id = pickCelebration(undefined, () => i / CELEBRATION_IDS.length)
      expect(CELEBRATION_IDS).toContain(id)
    }
  })

  it('never returns undefined and only ever an id from the catalogue', () => {
    const id = pickCelebration('smile-pop', () => 0.999999)
    expect(CELEBRATION_IDS).toContain(id)
  })

  it('never repeats the previous id', () => {
    for (const previous of CELEBRATION_IDS) {
      for (let i = 0; i < CELEBRATION_IDS.length; i++) {
        const id = pickCelebration(previous, () => i / CELEBRATION_IDS.length)
        expect(id).not.toBe(previous)
      }
    }
  })
})

describe('useCelebration', () => {
  beforeEach(() => {
    useCelebration().clear()
  })

  it('starts with no celebration', () => {
    const { celebration } = createCelebrationState()
    expect(celebration.value).toBeUndefined()
  })

  it('trigger() sets an id from the catalogue and the given color', () => {
    const { celebration, trigger } = createCelebrationState()
    trigger('var(--primary)', () => 0)
    expect(celebration.value?.color).toBe('var(--primary)')
    expect(CELEBRATION_IDS).toContain(celebration.value?.id)
  })

  it('clear() empties the celebration', () => {
    const { celebration, trigger, clear } = createCelebrationState()
    trigger('var(--primary)', () => 0)
    clear()
    expect(celebration.value).toBeUndefined()
  })

  it('a second trigger never repeats the first id', () => {
    const { celebration, trigger } = createCelebrationState()
    trigger('var(--primary)', () => 0)
    const first = celebration.value?.id
    trigger('var(--primary)', () => 0)
    expect(celebration.value?.id).not.toBe(first)
  })

  it('useCelebration() always returns the same shared instance, so App.vue and any screen see one state', () => {
    expect(useCelebration()).toBe(useCelebration())
  })
})
