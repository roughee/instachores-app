/**
 * Category glyphs and labels for the Log screen (DESIGN.md §4, §5
 * CategoryTile / TaskButton). Kept out of `domain/` (Architecture.md §2:
 * domain is pure TypeScript, no icon components) and out of any one screen
 * so `CategoryTile` and `TaskButton` share the same mapping.
 */
import { PhBaby, PhBathtub, PhBroom, PhCookingPot, PhNotepad, PhPlant, PhTShirt } from '@phosphor-icons/vue'
import type { Component } from 'vue'
import type { Category } from '@/schemas'

/** The seven categories shown as tiles on the Log screen (Plan §5.5); the
 * kid star board (`kid` category) has its own screen, not this grid. */
export const GRID_CATEGORIES: readonly Category[] = [
  'kitchen',
  'laundry',
  'floors',
  'bathroom',
  'kids',
  'home',
  'admin',
]

const LABELS: Partial<Record<Category, string>> = {
  kitchen: 'Kitchen',
  laundry: 'Laundry',
  floors: 'Floors',
  bathroom: 'Bathroom',
  kids: 'Kids',
  home: 'Home',
  admin: 'Admin',
}

const ICONS: Partial<Record<Category, Component>> = {
  kitchen: PhCookingPot,
  laundry: PhTShirt,
  floors: PhBroom,
  bathroom: PhBathtub,
  kids: PhBaby,
  home: PhPlant,
  admin: PhNotepad,
}

/** DESIGN.md §3 category tokens, as CSS `var()` references -- never a
 * literal (issue #53's celebration overlay colors itself from this). */
const COLOR_VARS: Partial<Record<Category, string>> = {
  kitchen: 'var(--cat-kitchen)',
  laundry: 'var(--cat-laundry)',
  floors: 'var(--cat-floors)',
  bathroom: 'var(--cat-bathroom)',
  kids: 'var(--cat-kids)',
  home: 'var(--cat-home)',
  admin: 'var(--cat-admin)',
}

export function categoryLabel(category: Category): string {
  return LABELS[category] ?? category
}

export function categoryIcon(category: Category): Component {
  return ICONS[category] ?? PhNotepad
}

/** The `kid` category (the star board) has no tile color of its own, so
 * this falls back to `--primary`, same as the un-mapped label/icon above. */
export function categoryColor(category: Category): string {
  return COLOR_VARS[category] ?? 'var(--primary)'
}
