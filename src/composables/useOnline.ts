/**
 * `navigator.onLine`, kept live through the `online`/`offline` window events
 * (issue #16, Plan §5.5 Welcome): the Connect button disables itself and
 * explains why while offline, and the demo stays the fallback. A tiny
 * composable of its own, separate from the sync store, because Welcome runs
 * before any repo is bound.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useOnline() {
  const online = ref(navigator.onLine)

  function update(): void {
    online.value = navigator.onLine
  }

  onMounted(() => {
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  })

  return { online }
}
