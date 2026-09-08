import { z } from 'zod'
import { Id, V1 } from './cells'
import { SetupLink } from './setupLink'

/**
 * What `sessionStore.connect()` persists in `localStorage` under
 * `homecrew.session` (issue #15) so a refreshed tab resumes the same
 * household without touching the network: the setup link, which household
 * it bootstrapped into, and which member this phone is signed in as.
 */
export const Session = z.object({
  v: V1,
  link: SetupLink,
  householdId: Id,
  memberUid: z.string().min(1),
})
export type Session = z.infer<typeof Session>
