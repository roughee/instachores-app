/**
 * Re-exports the build id `vite.config.ts` stamps in via `define` (issue
 * #45) as a real module binding. `.vue` files keep browser/build globals
 * out of their own `<script>` blocks (the same convention `usePwa.ts`'s
 * `hasFlag`/`flagValue` follow for `window`), so `SettingsScreen.vue`
 * imports this instead of reaching for the ambient `__BUILD_ID__` directly.
 */
export const buildId: string = __BUILD_ID__
