<script setup lang="ts">
/**
 * 2-column grid tile (DESIGN.md §5): the category icon on its soft tint,
 * never color alone (icon and label always shown together), plus today's
 * completion count. Tapping navigates to the category screen (issue #20).
 */
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'
import type { Category } from '@/schemas'

defineProps<{
  category: Category
  label: string
  icon: Component
  doneToday: number
  dueDot: boolean
}>()
</script>

<template>
  <RouterLink :to="`/log/${category}`" class="category-tile" :class="`category-tile--${category}`">
    <span class="category-tile__icon">
      <component :is="icon" :size="24" weight="regular" aria-hidden="true" />
      <span v-if="dueDot" class="category-tile__due" aria-hidden="true"></span>
    </span>
    <span class="category-tile__label">{{ label }}</span>
    <span v-if="doneToday > 0" class="category-tile__count" :aria-label="`${doneToday} done today`">
      {{ doneToday }}
    </span>
  </RouterLink>
</template>

<style scoped>
.category-tile {
  position: relative;
  display: flex;
  min-height: calc(var(--touch) + 24px);
  flex-direction: column;
  gap: 8px;
  padding: var(--card-pad);
  border-radius: var(--radius-card);
  background: var(--surface);
  text-decoration: none;
}

.category-tile__icon {
  position: relative;
  display: inline-flex;
  width: var(--touch);
  height: var(--touch);
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-card);
}

.category-tile__label {
  color: var(--text);
  font-size: var(--fs-md);
  font-weight: 600;
}

.category-tile__due {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-chip);
  background: var(--points);
}

.category-tile__count {
  position: absolute;
  top: var(--card-pad);
  right: var(--card-pad);
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-chip);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: var(--fs-xs);
  font-weight: 600;
}

.category-tile--kitchen .category-tile__icon {
  background: var(--cat-kitchen-soft);
  color: var(--cat-kitchen);
}

.category-tile--laundry .category-tile__icon {
  background: var(--cat-laundry-soft);
  color: var(--cat-laundry);
}

.category-tile--floors .category-tile__icon {
  background: var(--cat-floors-soft);
  color: var(--cat-floors);
}

.category-tile--bathroom .category-tile__icon {
  background: var(--cat-bathroom-soft);
  color: var(--cat-bathroom);
}

.category-tile--kids .category-tile__icon {
  background: var(--cat-kids-soft);
  color: var(--cat-kids);
}

.category-tile--home .category-tile__icon {
  background: var(--cat-home-soft);
  color: var(--cat-home);
}

.category-tile--admin .category-tile__icon {
  background: var(--cat-admin-soft);
  color: var(--cat-admin);
}
</style>
