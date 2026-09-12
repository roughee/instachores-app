/**
 * Category glyph + label (DESIGN.md §4 category glyphs, §5 SplitBars). Small
 * enough to inline in whichever component needs it; `src/screens/*` and the
 * Overview components read this instead of hand-rolling icon lookups.
 */
import {
  PhBaby,
  PhBathtub,
  PhBroom,
  PhCar,
  PhCookingPot,
  PhNotepad,
  PhPlant,
  PhStar,
  PhTShirt,
} from '@phosphor-icons/vue'
import type { Component } from 'vue'
import type { Category } from '@/schemas'

export interface CategoryMeta {
  label: string
  icon: Component
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  kitchen: { label: 'Kitchen', icon: PhCookingPot },
  laundry: { label: 'Laundry', icon: PhTShirt },
  floors: { label: 'Floors', icon: PhBroom },
  bathroom: { label: 'Bathroom', icon: PhBathtub },
  kids: { label: 'Kids', icon: PhBaby },
  home: { label: 'Home', icon: PhPlant },
  admin: { label: 'Admin', icon: PhNotepad },
  car: { label: 'Car', icon: PhCar },
  kid: { label: 'Star tasks', icon: PhStar },
}
