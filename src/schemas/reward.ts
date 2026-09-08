import { z } from 'zod'
import { Bool, DateT, Id, Int, OptStr, V1 } from './cells'

export const RewardKind = z.enum(['solo', 'treat', 'pooled', 'kid'])
export type RewardKind = z.infer<typeof RewardKind>

export const Reward = z.object({
  v: V1,
  id: Id,
  name: z.string().min(1).max(60),
  cost: Int(z.number().int().positive()),
  kind: RewardKind,
  /** What the other partner promises when this is acknowledged. */
  commitment: OptStr(z.string().max(140).optional()),
  archived: Bool(z.boolean().default(false)),
  updatedAt: DateT,
  updatedBy: z.string().min(1),
})
export type Reward = z.infer<typeof Reward>
