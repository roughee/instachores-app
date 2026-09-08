import { z } from 'zod'
import { DateT, V1 } from './cells'
import { ChoreEvent } from './event'
import { Household } from './household'
import { Reward } from './reward'
import { Task } from './task'

/** The export/import file. */
export const Backup = z.object({
  v: V1,
  exportedAt: DateT,
  household: Household,
  tasks: z.array(Task),
  rewards: z.array(Reward),
  events: z.array(ChoreEvent),
})
export type Backup = z.infer<typeof Backup>
