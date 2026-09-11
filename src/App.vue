<script setup lang="ts">
/**
 * AppShell (DESIGN.md §5): top status strip, routed content, bottom tab
 * bar with a center FAB. Safe-area aware; the tab bar and FAB meet the
 * 48px touch-target floor. Icons are decorative next to their visible
 * text label (tabs) or a labelled button (FAB), so the accessible name
 * comes from one place, not two competing ones.
 *
 * `Celebration` (issue #53) is mounted here once, not per screen: it
 * reads the shared `useCelebration()` state that `LogScreen` and
 * `CategoryScreen` write to, so it works from either without either
 * screen rendering its own overlay.
 */
import { computed } from 'vue'
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router'
import { PhChartBar, PhClockCounterClockwise, PhCookingPot, PhGift, PhListChecks } from '@phosphor-icons/vue'
import Celebration from '@/components/Celebration.vue'
import { categoryColor } from '@/components/categoryIcons'
import UpdateToast from '@/components/UpdateToast.vue'
import { CELEBRATION_IDS, useCelebration, type CelebrationId } from '@/composables/useCelebration'
import { flagValue, usePwa } from '@/composables/usePwa'
import { useSessionStore } from '@/stores/session'
import { useSyncStore } from '@/stores/sync'

function isCelebrationId(value: string | null): value is CelebrationId {
  return value !== null && (CELEBRATION_IDS as readonly string[]).includes(value)
}

// Dev-only `?forceCelebration=<id>` (scripts/screenshots.mjs pattern, issue
// #53): forces one specific moment on load instead of the random pick, for
// a deterministic screenshot. Harmless in production; nobody links to the
// app with this param.
const forcedCelebration = flagValue('forceCelebration')
if (isCelebrationId(forcedCelebration)) {
  useCelebration().triggerExact(forcedCelebration, categoryColor())
}

interface Tab {
  to: string
  label: string
  icon: typeof PhListChecks
}

const tabs: Tab[] = [
  { to: '/log', label: 'Log', icon: PhListChecks },
  { to: '/today', label: 'Today', icon: PhClockCounterClockwise },
  { to: '/overview', label: 'Overview', icon: PhChartBar },
  { to: '/rewards', label: 'Rewards', icon: PhGift },
]
const leftTabs = tabs.slice(0, 2)
const rightTabs = tabs.slice(2)

const route = useRoute()
const router = useRouter()

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`)
}

function logKitchenReset(): void {
  router.push('/log/kitchen')
}

const { needRefresh, reload } = usePwa()

// Small status strip (issue #16, DESIGN.md §5 AppShell): demo mode is always
// called out (it never talks to the network), otherwise the dot mirrors the
// sync store. The full sync panel with outbox detail is issue #21.
const session = useSessionStore()
const sync = useSyncStore()

const statusLabel = computed(() => {
  if (session.mode === 'demo') return 'Demo'
  if (!sync.online) return 'Offline'
  if (sync.outboxCount > 0) return 'Syncing'
  return 'Up to date'
})

const statusNeedsAttention = computed(() => session.mode === 'demo' || !sync.online || sync.outboxCount > 0)
</script>

<template>
  <div class="app-shell">
    <header class="app-shell__status" role="status">
      <span class="app-shell__status-dot" :class="{ 'app-shell__status-dot--warn': statusNeedsAttention }"></span>
      <span>{{ statusLabel }}</span>
    </header>

    <main class="app-shell__content">
      <RouterView />
    </main>

    <UpdateToast v-if="needRefresh" @reload="reload" />
    <Celebration />

    <nav class="app-shell__tabbar" aria-label="Primary">
      <RouterLink
        v-for="tab in leftTabs"
        :key="tab.to"
        :to="tab.to"
        class="app-shell__tab"
        :class="{ 'app-shell__tab--active': isActive(tab.to) }"
      >
        <component :is="tab.icon" :size="24" weight="regular" aria-hidden="true" />
        <span>{{ tab.label }}</span>
      </RouterLink>

      <button type="button" class="app-shell__fab" aria-label="Kitchen Reset" @click="logKitchenReset">
        <PhCookingPot :size="24" weight="regular" aria-hidden="true" />
      </button>

      <RouterLink
        v-for="tab in rightTabs"
        :key="tab.to"
        :to="tab.to"
        class="app-shell__tab"
        :class="{ 'app-shell__tab--active': isActive(tab.to) }"
      >
        <component :is="tab.icon" :size="24" weight="regular" aria-hidden="true" />
        <span>{{ tab.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text);
}

.app-shell__status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px var(--gutter);
  padding-top: calc(var(--safe-top) + 10px);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.app-shell__status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-chip);
  background: var(--success);
}

.app-shell__status-dot--warn {
  background: var(--warn);
}

.app-shell__content {
  flex: 1;
  padding-bottom: calc(var(--touch) + var(--gutter) * 2);
}

.app-shell__tabbar {
  position: fixed;
  right: var(--safe-right);
  bottom: 0;
  left: var(--safe-left);
  display: grid;
  grid-template-columns: 1fr 1fr auto 1fr 1fr;
  align-items: end;
  gap: 4px;
  padding: 8px var(--gutter) calc(var(--safe-bottom) + 8px);
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -2px 12px color-mix(in oklab, var(--text) 12%, transparent);
}

.app-shell__tab {
  display: flex;
  min-height: var(--touch);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: var(--radius-button);
  color: var(--text-2);
  font-size: var(--fs-xs);
  text-decoration: none;
  transition:
    color var(--dur-press) ease-out,
    background-color var(--dur-press) ease-out;
}

.app-shell__tab:active {
  background: var(--surface-2);
}

.app-shell__tab--active {
  color: var(--primary);
}

.app-shell__fab {
  display: flex;
  width: var(--touch);
  height: var(--touch);
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  margin-top: -26px;
  border: none;
  border-radius: var(--radius-chip);
  background: var(--primary);
  color: var(--on-primary);
  box-shadow: 0 4px 14px color-mix(in oklab, var(--primary) 45%, transparent);
  transition: transform var(--dur-press) ease-out;
}

.app-shell__fab:active {
  transform: scale(0.94);
}
</style>
