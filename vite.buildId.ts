/**
 * A build id stamped at build time (issue #45, Architecture.md §9): the
 * short commit SHA from `GITHUB_SHA` when the build runs in CI
 * (`deploy.yml`/`preview.yml`), otherwise a UTC dev timestamp. Reaches the
 * app bundle and `src/sw.ts` through the `define` in `vite.config.ts` --
 * this is the one thing worker and app build share, so the Sync panel's
 * "App build" and "Service worker" rows can actually differ across
 * deploys, unlike `package.json`'s hand-edited `version` (issue #21).
 *
 * `now` is injected, same pattern as `time.ts` (Architecture.md §8), so the
 * dev fallback is deterministic in tests.
 */
export function resolveBuildId(env: { GITHUB_SHA?: string }, now: Date = new Date()): string {
  const sha = env.GITHUB_SHA
  if (sha) return sha.slice(0, 7)

  const pad = (n: number): string => String(n).padStart(2, '0')
  const year = now.getUTCFullYear()
  const month = pad(now.getUTCMonth() + 1)
  const day = pad(now.getUTCDate())
  const hours = pad(now.getUTCHours())
  const minutes = pad(now.getUTCMinutes())
  return `dev-${year}${month}${day}T${hours}${minutes}`
}
