<script setup lang="ts">
/**
 * Week overview (DESIGN.md §5.5 `#/overview`, Plan §4 weekly target, issue
 * #19). Month view, the heat strip and CSV export are Phase 2 (Plan §5.5);
 * this screen is week-only for the MVP. The bar is the shared `HouseholdBar`
 * from the Log screen, fed the selected week's rollup.
 */
import { computed } from 'vue'
import { PhChartBar } from '@phosphor-icons/vue'
import EmptyState from '@/components/EmptyState.vue'
import HouseholdBar from '@/components/HouseholdBar.vue'
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

      <HouseholdBar
        :household="rollup.household"
        :target="displayTarget"
        :by-member="rollup.byMember"
        :members="householdStore.members"
      />

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
</style>
