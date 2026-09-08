import { z } from 'zod'
import { DateT, Id, Int, OptStr, V1 } from './cells'

const EventBase = z.object({
  v: V1,
  id: Id,
  /** Who tapped. */
  actorUid: z.string().min(1),
  /** When the deed happened (may be backdated). */
  at: DateT,
  /** When the row was appended; stamped by the script, used as the poll cursor. */
  loggedAt: DateT,
  note: OptStr(z.string().max(140).optional()),
})

const Points = Int(z.number().int().min(0).max(50))

/**
 * Discriminated on `type`, so `switch (e.type)` in the domain is exhaustive.
 * Unknown columns from a sheet row are stripped.
 */
export const ChoreEvent = z.discriminatedUnion('type', [
  EventBase.extend({ type: z.literal('complete'), taskId: Id, forUid: z.string().min(1), points: Points }),
  EventBase.extend({ type: z.literal('undo'), refEventId: Id }),
  EventBase.extend({ type: z.literal('kudos'), refEventId: Id, points: Int(z.literal(1)) }),
  EventBase.extend({ type: z.literal('claim'), rewardId: Id, forUid: z.string().min(1), cost: Int(z.number().int().positive()) }),
  EventBase.extend({ type: z.literal('ack'), refEventId: Id }),
  EventBase.extend({ type: z.literal('decline'), refEventId: Id }),
  EventBase.extend({ type: z.literal('adjust'), forUid: z.string().min(1), points: Int(z.number().int()), note: z.string().min(1).max(140) }),
  EventBase.extend({ type: z.literal('bonus'), forUid: z.string().min(1), points: Points, combo: z.string().min(1), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
])
export type ChoreEvent = z.infer<typeof ChoreEvent>
export type EventType = ChoreEvent['type']
export type EventOf<T extends EventType> = Extract<ChoreEvent, { type: T }>
