import { createApp } from 'vue'

/**
 * Runs a composable inside a throwaway component so lifecycle hooks
 * (`onMounted`, `onBeforeUnmount`) fire, then mounts it to a detached
 * element. Returns the composable's result and the app, so a test can call
 * `app.unmount()` to exercise cleanup.
 */
export function withSetup<T>(composable: () => T): [T, ReturnType<typeof createApp>] {
  let result!: T
  const app = createApp({
    setup() {
      result = composable()
      return () => null
    },
  })
  app.mount(document.createElement('div'))
  return [result, app]
}
