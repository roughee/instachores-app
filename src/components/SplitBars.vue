<script setup lang="ts">
/**
 * Two horizontal bars per category, one per adult, in the category colour
 * at two opacities (DESIGN.md §5 SplitBars, Plan §5.5 `#/overview`, issue
 * #19). Category colour is never the only signal: every bar carries the
 * member's name and its value as text (Plan §5.7).
 */
import { computed } from 'vue'
import type { Category } from '@/schemas'
import { CATEGORY_META } from './categoryMeta'

export interface SplitBarsMember {
  uid: string
  name: string
}

const props = defineProps<{
  members: SplitBarsMember[]
  byCategory: Partial<Record<Category, Record<string, number>>>
}>()

const valueOf = (category: Category, uid: string): number => props.byCategory[category]?.[uid] ?? 0

const categories = computed<Category[]>(() =>
  (Object.keys(props.byCategory) as Category[]).filter((c) => props.members.some((m) => valueOf(c, m.uid) > 0)),
)

/** Every bar in the period shares one scale, so lengths are comparable across categories. */
const max = computed<number>(() =>
  Math.max(1, ...categories.value.flatMap((c) => props.members.map((m) => valueOf(c, m.uid)))),
)

function widthPct(category: Category, uid: string): number {
  return Math.round((valueOf(category, uid) / max.value) * 100)
}

function barColor(category: Category, index: number): string {
  return index === 0 ? `var(--cat-${category})` : `color-mix(in oklab, var(--cat-${category}) 55%, transparent)`
}
</script>

<template>
  <div class="split-bars">
    <div v-for="category in categories" :key="category" class="split-bars__category">
      <div class="split-bars__header">
        <component :is="CATEGORY_META[category].icon" :size="20" weight="regular" aria-hidden="true" />
        <span class="split-bars__header-label">{{ CATEGORY_META[category].label }}</span>
      </div>
      <div v-for="(member, index) in members" :key="member.uid" class="split-bars__row">
        <span class="split-bars__name">{{ member.name }}</span>
        <div class="split-bars__track">
          <div
            class="split-bars__fill"
            :style="{ width: widthPct(category, member.uid) + '%', background: barColor(category, index) }"
          />
        </div>
        <span class="split-bars__value tabular-nums">{{ valueOf(category, member.uid) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.split-bars {
  display: flex;
  flex-direction: column;
  gap: var(--card-pad);
}

.split-bars__category {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--card-pad);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.split-bars__header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  margin-bottom: 4px;
}

.split-bars__header-label {
  font-weight: 600;
  font-size: var(--fs-md);
}

.split-bars__row {
  display: grid;
  grid-template-columns: 4.5rem 1fr 2.5rem;
  align-items: center;
  gap: var(--list-gap);
}

.split-bars__name {
  color: var(--text-2);
  font-size: var(--fs-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.split-bars__track {
  height: 10px;
  border-radius: var(--radius-chip);
  background: var(--surface-2);
  overflow: hidden;
}

.split-bars__fill {
  height: 100%;
  border-radius: var(--radius-chip);
  transition: width var(--dur-sheet) ease-out;
}

.split-bars__value {
  color: var(--text);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-align: right;
}
</style>
