/**
 * `src/components/categoryIcons.ts` (DESIGN.md §4, §5): the label/icon/color
 * mapping the Log grid and every category-colored component read from, plus
 * the grid order the Log screen renders (issue #63 adds Car after Admin).
 */
import { describe, expect, it } from 'vitest'
import { PhCar, PhNotepad } from '@phosphor-icons/vue'
import { categoryColor, categoryIcon, categoryLabel, GRID_CATEGORIES } from '@/components/categoryIcons'

describe('categoryIcons', () => {
  it('labels the car category "Car"', () => {
    expect(categoryLabel('car')).toBe('Car')
  })

  it('gives the car category the PhCar icon', () => {
    expect(categoryIcon('car')).toBe(PhCar)
  })

  it('colors the car category from --cat-car', () => {
    expect(categoryColor('car')).toBe('var(--cat-car)')
  })

  it('shows Car right after Admin in the Log grid', () => {
    expect(GRID_CATEGORIES).toEqual(['kitchen', 'laundry', 'floors', 'bathroom', 'kids', 'home', 'admin', 'car'])
  })

  it('still falls back to the generic notepad icon and label for an unmapped category', () => {
    expect(categoryIcon('kid')).toBe(PhNotepad)
    expect(categoryLabel('kid')).toBe('kid')
  })
})
