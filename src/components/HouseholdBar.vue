<script setup lang="ts">
/**
 * Household bar (DESIGN.md §5): the single calm progress bar for the Log
 * screen, "187 / 250" in tabular numerals. Tapping it expands into the
 * member split, one bar per adult in that member's own color.
 */
import { computed, ref } from 'vue'
import type { Member } from '@/schemas'

interface MemberRollup {
  points: number
  count: number
}

const props = defineProps<{
  household: number
  target: number
  byMember: Record<string, MemberRollup>
  members: Member[]
}>()

const expanded = ref(false)

function toggle(): void {
  expanded.value = !expanded.value
}

function pct(points: number): number {
  if (props.target <= 0) return 0
  return Math.min(100, Math.max(0, (points / props.target) * 100))
}

const fillPct = computed(() => pct(props.household))
const splitMembers = computed(() => props.members.filter((m) => m.role === 'adult'))

function pointsFor(uid: string): number {
  return props.byMember[uid]?.points ?? 0
}
</script>

<template>
  <section class="household-bar">
    <button
      type="button"
      class="household-bar__summary"
      :aria-expanded="expanded"
      aria-label="Household points, tap for the split"
      @click="toggle"
    >
      <span class="household-bar__numbers tabular-nums">{{ household }} / {{ target }}</span>
      <span class="household-bar__track">
        <span class="household-bar__fill" :style="{ width: `${fillPct}%` }"></span>
      </span>
    </button>
    <ul v-if="expanded" class="household-bar__split">
      <li v-for="m in splitMembers" :key="m.uid" class="household-bar__split-row">
        <span class="household-bar__split-name">{{ m.name }}</span>
        <span class="household-bar__split-track">
          <span
            class="household-bar__split-fill"
            :style="{ width: `${pct(pointsFor(m.uid))}%`, background: m.color }"
          ></span>
        </span>
        <span class="household-bar__split-points tabular-nums">{{ pointsFor(m.uid) }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.household-bar {
  padding: var(--card-pad);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.household-bar__summary {
  display: flex;
  width: 100%;
  min-height: var(--touch);
  flex-direction: column;
  gap: 8px;
  border: none;
  text-align: left;
}

.household-bar__numbers {
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 600;
}

.household-bar__track {
  overflow: hidden;
  height: 10px;
  border-radius: var(--radius-chip);
  background: var(--surface-2);
}

.household-bar__fill {
  height: 100%;
  border-radius: var(--radius-chip);
  background: var(--primary);
  transition: width var(--dur-count) ease-out;
}

.household-bar__split {
  display: flex;
  flex-direction: column;
  gap: var(--list-gap);
  margin: var(--list-gap) 0 0;
  padding: 0;
  list-style: none;
}

.household-bar__split-row {
  display: grid;
  grid-template-columns: 64px 1fr 40px;
  align-items: center;
  gap: 8px;
}

.household-bar__split-name {
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.household-bar__split-track {
  overflow: hidden;
  height: 6px;
  border-radius: var(--radius-chip);
  background: var(--surface-2);
}

.household-bar__split-fill {
  height: 100%;
  border-radius: var(--radius-chip);
}

.household-bar__split-points {
  color: var(--text);
  font-size: var(--fs-sm);
  text-align: right;
}
</style>
