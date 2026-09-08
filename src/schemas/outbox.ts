import { z } from 'zod'
import { DateT, Int } from './cells'
import { ChoreEvent } from './event'
import { Reward } from './reward'
import { Task } from './task'

const Seq = Int(z.number().int().nonnegative())

/**
 * One pending write in the outbox (Architecture §6). Discriminated on `kind`
 * so the payload shape always matches the action it will be sent as.
 */
export const OutboxEntry = z.discriminatedUnion('kind', [
  z.object({ seq: Seq, kind: z.literal('events.append'), payload: ChoreEvent, enqueuedAt: DateT }),
  z.object({ seq: Seq, kind: z.literal('tasks.upsert'), payload: Task, enqueuedAt: DateT }),
  z.object({ seq: Seq, kind: z.literal('rewards.upsert'), payload: Reward, enqueuedAt: DateT }),
])
export type OutboxEntry = z.infer<typeof OutboxEntry>
export type OutboxKind = OutboxEntry['kind']
