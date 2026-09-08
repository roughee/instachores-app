<script setup lang="ts">
/**
 * Week overview (DESIGN.md §5.5 `#/overview`, Plan §4 weekly target, issue
 * #19). Month view, the heat strip and CSV export are Phase 2 (Plan §5.5);
 * this screen is week-only for the MVP. The household bar is rendered
 * inline here, with the class names DESIGN.md §5 plans for a shared
 * `HouseholdBar` component, rather than declaring that component from this
 * branch (issue #17 may add it in parallel) -- see the ticket report for
 * the note to unify the two.
 */
import { computed } from 'vue'
import { PhChartBar } from '@phosphor-icons/vue'
import EmptyState from '@/components/EmptyState.vue'
import MemberSplit from '@/components/MemberSplit.vue'
import SplitBars from '@/components/SplitBars.vue'
import WeekNav from '@/components/WeekNav.vue'
import { useEventsStore } from '@/stores/events'
import { useHouseholdStore } from '@/stores/household'

const householdStore = useHouseholdStore()
const eventsStore = useEventsStore()

const rollup = computed(() => eventsStore.weekRollup)

/** The full weekly target once the week is over, pro-rated to today otherwise (Plan §5.5). */
const displayTarget = computed(() =>
  rollup.value.elapsedDays >= 7 ? rollup.value.target : rollup.value.proRatedTarget,
)

const progressPct = computed(() =>
  displayTarget.value > 0 ? Math.min(100, Math.round((rollup.value.household / displayTarget.value) * 100)) : 0,
)

const hasData = computed(() => rollup.value.household > 0 || Object.keys(rollup.value.byCategory).length > 0)

const adults = computed(() => householdStore.adults.map((m) => ({ uid: m.uid, name: m.name })))
</script>

<template>
  <section class="overview">
    <EmptyState v-if="!householdStore.household" :icon="PhChartBar" label="Loading the week." />
    <template v-else>
      <WeekNav
        :start="rollup.start"
        :end="rollup.end"
        :tz="householdStore.household.tz"
        :next-disabled="eventsStore.weekOffset >= 0"
        @prev="eventsStore.prevWeek()"
        @next="eventsStore.nextWeek()"
      />

      <div
        class="household-bar"
        role="img"
        :aria-label="`Household ${rollup.household} of ${displayTarget} points this week`"
      >
        <div class="household-bar__track">
          <div class="household-bar__fill" :style="{ width: progressPct + '%' }" />
        </div>
        <p class="household-bar__value tabular-nums">{{ rollup.household }} / {{ displayTarget }}</p>
      </div>

      <template v-if="hasData">
        <MemberSplit :members="adults" :by-member="rollup.byMember" :by-category="rollup.byCategory" />
        <SplitBars :members="adults" :by-category="rollup.byCategory" />
      </template>
      <EmptyState v-else :icon="PhChartBar" label="Nothing logged this week" />
    </template>
  </section>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: var(--card-pad);
  padding: var(--gutter);
}

.household-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.household-bar__track {
  height: 12px;
  border-radius: var(--radius-chip);
  background: var(--surface-2);
  overflow: hidden;
}

.household-bar__fill {
  height: 100%;
  border-radius: var(--radius-chip);
  background: var(--primary);
  transition: width var(--dur-count) ease-out;
}

.household-bar__value {
  align-self: flex-end;
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 600;
  color: var(--text);
}
</style>
