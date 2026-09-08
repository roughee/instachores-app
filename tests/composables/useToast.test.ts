import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_DURATION_MS, useToast } from '@/composables/useToast'
import { configureSession } from '@/stores/sessionOptions'

let clock = new Date('2026-01-01T00:00:00.000Z')

beforeEach(() => {
  clock = new Date('2026-01-01T00:00:00.000Z')
  configureSession({ now: () => clock })
})

describe('useToast', () => {
  it('starts with no toast', () => {
    const { toast } = useToast()
    expect(toast.value).toBeUndefined()
  })

  it('show() sets the message, action and an expiresAt 4s out from the injected clock', () => {
    const onAction = vi.fn()
    const { toast, show } = useToast()

    show({ message: 'Pots logged', action: { label: 'Undo', onAction } })

    expect(toast.value?.message).toBe('Pots logged')
    expect(toast.value?.action?.label).toBe('Undo')
    expect(toast.value?.expiresAt).toBe(clock.getTime() + TOAST_DURATION_MS)
  })

  it('a second show() replaces the first, not queues it', () => {
    const { toast, show } = useToast()

    show({ message: 'Pots logged' })
    show({ message: 'Counters logged' })

    expect(toast.value?.message).toBe('Counters logged')
  })

  it('dismiss() clears the toast', () => {
    const { toast, show, dismiss } = useToast()

    show({ message: 'Pots logged' })
    dismiss()

    expect(toast.value).toBeUndefined()
  })
})
