/**
 * Issue #72 (Schedule feature #64, ticket 7 of 7): "Do all" on the Clean
 * bathroom combo group, "Next time?", the Category fold, the Schedule tab,
 * and "bring back early" from the fold -- against the production build with
 * the Apps Script endpoint mocked in the browser, exactly like the other
 * e2e specs. The clock is never faked (the "returns on the due day" rule is
 * `tests/domain/schedule.test.ts`'s job); `dueDayFor` (`@/domain/schedule`)
 * is imported so this spec computes the expected due day the same way the
 * app does, off the actual completion time the mocked sheet recorded.
 */
import { expect, test } from '@playwright/test'
import { dayNumber, weekdayShort } from '@/domain/scheduleCopy'
import { dueDayFor } from '@/domain/schedule'
import { SEED_IDS } from '@/domain/seed'
import { MEMBERS, TASKS } from './support/household'
import { MockSheet, mockSetupLinkToken, routeMockSheet } from './support/mockSheet'
import type { RawRow } from './support/mockSheet'

const POLL_MS = 1000
const CHILD_IDS = [SEED_IDS.toilet, SEED_IDS.bathSink, SEED_IDS.shower, SEED_IDS.drain]

test('Do all on the Clean bathroom group schedules it, folds it, lists it on Schedule, and unschedules from the fold', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const sheet = new MockSheet({ members: MEMBERS, tasks: TASKS })
  await routeMockSheet(context, sheet)
  function appendedEvents(): RawRow[] {
    return sheet.appendCalls.flatMap((c) => c.events)
  }
  function indexOfId(id: unknown): number {
    return appendedEvents().findIndex((e) => e.id === id)
  }

  const token = mockSetupLinkToken()

  // Ana connects and opens Bathroom.
  await page.goto(`#/welcome?s=${token}`)
  await page.getByTestId('connect-button').click()
  await page.getByTestId('member-list').waitFor()
  await page.getByTestId('member-button').filter({ hasText: 'Ana' }).click()
  await page.waitForURL(/#\/log$/)
  await page.goto('#/log/bathroom')

  await expect(page.getByTestId('task-group-do-all')).toBeVisible()
  await expect(page.locator('.task-group__name')).toHaveText('Clean bathroom')

  let scheduleEvent: RawRow | undefined
  let expectedDueAt: Date | undefined

  // A second phone (Ben), connected and watching Bathroom on a short poll
  // before the group is ever scheduled, so it can be shown catching the
  // fold from a sync rather than from its own initial bootstrap.
  const contextB = await browser.newContext()
  await routeMockSheet(contextB, sheet)
  const pageB = await contextB.newPage()
  try {
    await pageB.goto(`${baseURL}?pollMs=${POLL_MS}#/welcome?s=${token}`)
    await pageB.getByTestId('connect-button').click()
    await pageB.getByTestId('member-list').waitFor()
    await pageB.getByTestId('member-button').filter({ hasText: 'Ben' }).click()
    await pageB.waitForURL(/#\/log$/)
    // Re-including `?pollMs=` (not a bare `#/log/bathroom`) keeps the short
    // poll cadence: a plain hash-only URL resolves against `baseURL` and
    // drops the query, which would reload the page onto the real 30s poll.
    await pageB.goto(`${baseURL}?pollMs=${POLL_MS}#/log/bathroom`)
    await expect(pageB.getByTestId('task-group-do-all')).toBeVisible()

    // "Do all" completes every active sub-item and the combo bonus, then
    // opens "Next time?" for the parent with its own 7-day interval
    // preselected.
    await page.getByTestId('task-group-do-all').click()
    await expect(page.locator('.next-time-sheet__title')).toHaveText('Clean bathroom logged')
    const sevenDaysChip = page.getByTestId('next-time-chip').filter({ hasText: '7 days' })
    await expect(sevenDaysChip).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('next-time-schedule').click()
    // The toast queued behind the sheet must not block anything below.
    await expect(page.locator('.toast')).toBeHidden({ timeout: 6000 })

    // The mock sheet received, in order: one complete per active sub-item,
    // one bonus with `combo` = the parent id, then one `schedule` event for
    // the parent, referencing the last sub-item's complete.
    await expect.poll(() => appendedEvents().some((e) => e.type === 'schedule')).toBe(true)

    const completes = appendedEvents().filter((e) => e.type === 'complete')
    expect(completes.map((e) => e.taskId)).toEqual(CHILD_IDS)
    const lastComplete = completes[completes.length - 1]
    if (!lastComplete) throw new Error('expected 4 complete events, got none')

    const bonus = appendedEvents().find((e) => e.type === 'bonus')
    if (!bonus) throw new Error('expected a combo bonus event')
    expect(bonus.combo).toBe(SEED_IDS.cleanBathroom)

    scheduleEvent = appendedEvents().find((e) => e.type === 'schedule')
    if (!scheduleEvent) throw new Error('expected a schedule event')
    expect(scheduleEvent.taskId).toBe(SEED_IDS.cleanBathroom)
    expect(scheduleEvent.refEventId).toBe(lastComplete.id)
    expect(scheduleEvent.days).toBe(7)

    const refAt = new Date(String(lastComplete.at))
    expectedDueAt = dueDayFor(refAt, 7, 'UTC')
    expect(new Date(String(scheduleEvent.dueAt)).getTime()).toBe(expectedDueAt.getTime())

    // Ordering: every complete precedes the bonus, which precedes the schedule.
    const lastCompleteIdx = Math.max(...completes.map((c) => indexOfId(c.id)))
    const bonusIdx = indexOfId(bonus.id)
    const scheduleIdx = indexOfId(scheduleEvent.id)
    expect(bonusIdx).toBeGreaterThan(lastCompleteIdx)
    expect(scheduleIdx).toBeGreaterThan(bonusIdx)

    // Bathroom no longer offers "Do all"; the Scheduled fold shows it with a "back" label.
    await expect(page.getByTestId('task-group-do-all')).toHaveCount(0)
    const foldRow = page.getByTestId('scheduled-row')
    await expect(foldRow).toContainText('Clean bathroom')
    await expect(foldRow).toContainText('back')

    // Ben's phone folds the group too, after one poll, with no reload.
    await expect(pageB.getByTestId('task-group-do-all')).toHaveCount(0, { timeout: POLL_MS * 3 })
    await expect(pageB.getByTestId('scheduled-row')).toContainText('Clean bathroom')
  } finally {
    await contextB.close()
  }

  if (!scheduleEvent || !expectedDueAt) throw new Error('setup incomplete: no schedule event recorded')

  // #/schedule lists it under "This week" with a "Sat 19"-style day chip,
  // and Recently done shows it coming back in 7 days.
  await page.goto('#/schedule')
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible()
  const scheduleRow = page.getByTestId('schedule-row').filter({ hasText: 'Clean bathroom' })
  await expect(scheduleRow).toBeVisible()
  const expectedChip = `${weekdayShort(expectedDueAt, 'UTC')} ${dayNumber(expectedDueAt, 'UTC')}`
  await expect(scheduleRow.locator('[data-test="schedule-row-chip"]')).toHaveText(expectedChip)

  const recentRow = page.getByTestId('recent-done-row').filter({ hasText: 'Clean bathroom' })
  await expect(recentRow).toContainText('back in 7 days')

  // Back on Bathroom: tapping the folded row unschedules it (bring back
  // early) and the group is listed again with its own "Do all".
  await page.goto('#/log/bathroom')
  await page.getByTestId('scheduled-row').click()

  await expect.poll(() => appendedEvents().some((e) => e.type === 'unschedule')).toBe(true)
  const unscheduleEvent = appendedEvents().find((e) => e.type === 'unschedule')
  expect(unscheduleEvent?.refEventId).toBe(scheduleEvent.id)

  await expect(page.getByTestId('scheduled-row')).toHaveCount(0)
  await expect(page.getByTestId('task-group-do-all')).toBeVisible()
})
