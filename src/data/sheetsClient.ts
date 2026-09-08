/**
 * The one place that talks HTTP to the Apps Script web app (Architecture
 * §5). Apps Script only accepts cross-origin requests that are "simple" in
 * CORS terms, so the body goes as `text/plain` JSON and the client follows
 * the redirect Apps Script issues. A pure function of its inputs: no module
 * state, `fetch` is passed in, so tests stub it directly.
 */
import { RepoError } from './repo'
import type { RepoErrorCode } from './repo'

const REPO_ERROR_CODES: readonly RepoErrorCode[] = ['unauthorized', 'conflict', 'invalid', 'locked', 'network']

function isRepoErrorCode(code: unknown): code is RepoErrorCode {
  return typeof code === 'string' && (REPO_ERROR_CODES as readonly string[]).includes(code)
}

/**
 * Posts `{ secret, action, ...params }` to `url` and resolves with the
 * parsed JSON response. An `{ ok: false, code }` response rejects with a
 * `RepoError` carrying that code (falling back to `'invalid'` for an
 * unrecognised or missing code); a network failure, or a response that does
 * not parse as JSON, rejects with `RepoError('network', ...)`.
 */
export async function postAction<T = unknown>(
  fetchImpl: typeof fetch,
  url: string,
  secret: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, action, ...params }),
    })
  } catch (err) {
    throw new RepoError('network', `network error calling ${action}: ${String(err)}`)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (err) {
    throw new RepoError('network', `could not parse the response for ${action}: ${String(err)}`)
  }

  if (body !== null && typeof body === 'object' && (body as { ok?: unknown }).ok === false) {
    const { code, message } = body as { code?: unknown; message?: unknown }
    throw new RepoError(
      isRepoErrorCode(code) ? code : 'invalid',
      typeof message === 'string' ? message : `${action} failed`,
    )
  }

  return body as T
}
