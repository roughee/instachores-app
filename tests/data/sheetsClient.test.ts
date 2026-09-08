import { describe, expect, it, vi } from 'vitest'
import { postAction } from '@/data/sheetsClient'
import { RepoError } from '@/data/repo'

const URL = 'https://script.google.com/macros/s/abc/exec'
const SECRET = 'x'.repeat(12)

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response
}

describe('postAction', () => {
  it('sends the request envelope as text/plain JSON with redirect: follow', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true, version: '1.0.0' }))
    await postAction(fetchImpl, URL, SECRET, 'version', {})

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toBe(URL)
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('follow')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=utf-8')
    expect(JSON.parse(init.body as string)).toEqual({ secret: SECRET, action: 'version' })
  })

  it('merges params into the envelope alongside secret and action', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true, events: [] }))
    await postAction(fetchImpl, URL, SECRET, 'events.since', { since: '2026-09-01T00:00:00.000Z' })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      secret: SECRET,
      action: 'events.since',
      since: '2026-09-01T00:00:00.000Z',
    })
  })

  it('resolves with the parsed JSON body on ok: true', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true, appended: ['a'], skipped: [], loggedAt: 'x' }))
    const result = await postAction<{ appended: string[] }>(fetchImpl, URL, SECRET, 'events.append', { events: [] })
    expect(result.appended).toEqual(['a'])
  })

  it('maps { ok: false, code } to a RepoError carrying that code and message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: false, code: 'unauthorized', message: 'nope' }))
    await expect(postAction(fetchImpl, URL, SECRET, 'bootstrap', {})).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'nope',
    })
  })

  it('every documented error code round-trips through RepoError', async () => {
    for (const code of ['conflict', 'invalid', 'locked'] as const) {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: false, code }))
      const err = await postAction(fetchImpl, URL, SECRET, 'tasks.upsert', {}).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(RepoError)
      expect((err as RepoError).code).toBe(code)
    }
  })

  it('a fetch that throws (offline) becomes a RepoError with code "network"', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await postAction(fetchImpl, URL, SECRET, 'events.since', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RepoError)
    expect((err as RepoError).code).toBe('network')
  })

  it('a response body that is not valid JSON becomes a RepoError with code "network"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ json: () => Promise.reject(new Error('bad json')) } as Response)
    const err = await postAction(fetchImpl, URL, SECRET, 'version', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RepoError)
    expect((err as RepoError).code).toBe('network')
  })

  it('an error body missing a recognised code falls back to "invalid"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: false }))
    const err = await postAction(fetchImpl, URL, SECRET, 'seed', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RepoError)
    expect((err as RepoError).code).toBe('invalid')
  })
})
