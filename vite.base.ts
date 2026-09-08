/**
 * The Vite `base` and the hash router (`src/router.ts`) must agree on where
 * the app is served from, or a refresh loses its assets (issue #12).
 *
 * The default serves the app from the repo's GitHub Pages root. `preview.yml`
 * overrides it with `VITE_BASE=/instachores-app/pr-<n>/` so a PR's build
 * resolves its assets under that preview's subfolder instead.
 */
const DEFAULT_BASE = '/instachores-app/'

export function resolveBase(env: { VITE_BASE?: string }): string {
  const base = env.VITE_BASE ?? DEFAULT_BASE
  return base.endsWith('/') ? base : `${base}/`
}
