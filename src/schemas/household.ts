import { z } from 'zod'
import { DateT, Id, Int, V1 } from './cells'

export const Member = z.object({
  uid: z.string().min(1).max(32),
  name: z.string().min(1).max(24),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  role: z.enum(['adult', 'kid']),
})
export type Member = z.infer<typeof Member>

export const Household = z.object({
  v: V1,
  id: Id,
  name: z.string().min(1).max(40),
  weeklyTarget: Int(z.number().int().positive()),
  /** IANA timezone; week boundaries are Monday 00:00 in this zone. */
  tz: z.string().min(1),
  members: z.record(z.string(), Member),
  createdAt: DateT,
})
export type Household = z.infer<typeof Household>
