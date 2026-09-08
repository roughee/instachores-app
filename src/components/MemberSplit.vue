<script setup lang="ts">
/**
 * Per-adult points, task count, and top category for the period (DESIGN.md
 * §5.5 `#/overview` member split, issue #19). Reads a `Rollup`'s
 * `byMember`/`byCategory` shape directly so the Overview screen can pass
 * `weekRollup` straight through.
 */
import { computed } from 'vue'
import type { Category } from '@/schemas'
import { CATEGORY_META } from './categoryMeta'

export interface MemberSplitMember {
  uid: string
  name: string
}

const props = defineProps<{
  members: MemberSplitMember[]
  byMember: Record<string, { points: number; count: number }>
  byCategory: Partial<Record<Category, Record<string, number>>>
}>()

interface Entry {
  uid: string
  name: string
  points: number
  count: number
  topCategory: Category | undefined
}

const entries = computed<Entry[]>(() =>
  props.members.map((member) => {
    let topCategory: Category | undefined
    let topPoints = 0
    for (const category of Object.keys(props.byCategory) as Category[]) {
      const points = props.byCategory[category]?.[member.uid] ?? 0
      if (points > topPoints) {
        topPoints = points
        topCategory = category
      }
    }
    const stat = props.byMember[member.uid]
    return {
      uid: member.uid,
      name: member.name,
      points: stat?.points ?? 0,
      count: stat?.count ?? 0,
      topCategory,
    }
  }),
)
</script>

<template>
  <div class="member-split">
    <article v-for="entry in entries" :key="entry.uid" class="member-split__card">
      <span class="member-split__avatar" aria-hidden="true">{{ entry.name.charAt(0) }}</span>
      <p class="member-split__name">{{ entry.name }}</p>
      <p class="member-split__points tabular-nums">{{ entry.points }}</p>
      <p class="member-split__count">{{ entry.count }} tasks</p>
      <p class="member-split__top-category">
        <template v-if="entry.topCategory">
          <component :is="CATEGORY_META[entry.topCategory].icon" :size="16" weight="regular" aria-hidden="true" />
          {{ CATEGORY_META[entry.topCategory].label }}
        </template>
        <template v-else>No tasks yet</template>
      </p>
    </article>
  </div>
</template>

<style scoped>
.member-split {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--list-gap);
}

.member-split__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--card-pad);
  border-radius: var(--radius-card);
  background: var(--surface);
  text-align: center;
}

.member-split__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-chip);
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
}

.member-split__name {
  color: var(--text);
  font-weight: 600;
  font-size: var(--fs-md);
}

.member-split__points {
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--points);
}

.member-split__count {
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.member-split__top-category {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
  font-size: var(--fs-xs);
}
</style>
