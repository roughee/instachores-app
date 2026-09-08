/**
 * Issue #22: logging while offline still updates the household bar; once
 * back online the queued event reaches the mocked script exactly once and
 * the outbox count returns to zero (`syncStore.outboxCount`, shown on Log as
 * "N waiting to sync").
 */
import { expect, test } from '@playwright/test'
import { MEMBERS, TASKS } from './support/household'
import { MockSheet, mockSetupLinkToken, routeMockSheet } from './support/mockSheet'

test('a tap while offline updates the bar immediately, then syncs once and clears the outbox once back online', async ({
  page,
  context,
}) => {
  const sheet = new MockSheet({ members: MEMBERS, tasks: TASKS })
  await routeMockSheet(context, sheet)

  const token = mockSetupLinkToken()
  await page.goto(`#/welcome?s=${token}`)
  await page.getByTestId('connect-button').click()
  await page.getByTestId('member-list').waitFor()
  await page.getByTestId('member-button').filter({ hasText: 'Ana' }).click()
  await page.waitForURL(/#\/log$/)
  await expect(page.locator('.household-bar__numbers')).toHaveText('0 / 250')

  // `sheet.offline` makes the mocked route itself fail; `context.setOffline`
  // alone would not, since a routed request never reaches the network layer
  // that flag simulates -- see mockSheet.ts's module doc comment. The
  // context flag is still needed for the `online` event below.
  sheet.offline = true
  await context.setOffline(true)

  await page.getByTestId('task-button').first().click()
  await expect(page.locator('.household-bar__numbers')).toHaveText('2 / 250')
  await expect(page.locator('.log-screen__sync-note')).toHaveText('1 waiting to sync')

  // The network is down: nothing has reached "the script" yet.
  expect(sheet.appendCalls).toHaveLength(0)

  sheet.offline = false
  await context.setOffline(false)

  // The `online` event triggers an immediate poll/flush (SheetsRepo.onOnline).
  await expect.poll(() => sheet.appendCalls.length).toBe(1)
  expect(sheet.appendCalls[0]?.events).toHaveLength(1)
  await expect(page.locator('.log-screen__sync-note')).toHaveCount(0)
})
