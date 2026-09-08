import { z } from 'zod'
import { Bool, DateT, Id, Int, OptId, V1 } from './cells'

export const Category = z.enum(['kitchen', 'laundry', 'floors', 'bathroom', 'kids', 'home', 'admin', 'kid'])
export type Category = z.infer<typeof Category>

export const Freq = z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'adhoc'])
export type Freq = z.infer<typeof Freq>

export const Task = z.object({
  v: V1,
  id: Id,
  name: z.string().min(1).max(60),
  category: Category,
  points: Int(z.number().int().min(0).max(50)),
  freq: Freq,
  forRole: z.enum(['adult', 'kid']).default('adult'),
  /** Sub-item of a group task (Toilet -> Clean bathroom). */
  parentId: OptId,
  /** On a parent: bonus when every active sub-item is done the same day. */
  comboBonus: Int(z.number().int().min(0).optional()),
  archived: Bool(z.boolean().default(false)),
  sort: Int(z.number().int().default(0)),
  updatedAt: DateT,
  updatedBy: z.string().min(1),
})
export type Task = z.infer<typeof Task>
