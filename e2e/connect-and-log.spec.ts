/**
 * Issue #22: connecting by setup link and the two-tap log, against the
 * production build with the Apps Script endpoint mocked in the browser.
 */
import { expect, test } from '@playwright/test'
import { MEMBERS, TASKS } from './support/household'
import { MockSheet, mockSetupLinkToken, routeMockSheet } from './support/mockSheet'

test('connects via a setup link, picks a member, lands on Log, and a quick-row tap logs the task in exactly one events.append', async ({
  page,
  context,
}) => {
  const sheet = new MockSheet({ members: MEMBERS, tasks: TASKS })
  await routeMockSheet(context, sheet)

  const token = mockSetupLinkToken()
  await page.goto(`#/welcome?s=${token}`)

  // The link's token is pre-filled from the URL (WelcomeScreen.vue); Connect
  // previews the household and shows "Who are you?".
  await page.getByTestId('connect-button').click()
  await page.getByTestId('member-list').waitFor()
  const anaButton = page.getByTestId('member-button').filter({ hasText: 'Ana' })
  await expect(anaButton).toBeVisible()
  await anaButton.click()

  await page.waitForURL(/#\/log$/)
  await expect(page.locator('.household-bar__numbers')).toHaveText('0 / 250')

  // Two-tap log: one tap on the first quick-row task (Pots, +2, the default
  // quick row's first entry with no history -- src/domain/derive.ts).
  const taskButtons = page.getByTestId('task-button')
  await expect(taskButtons.first()).toContainText('Pots')
  await taskButtons.first().click()

  // The household bar reflects the tap before any network round trip settles.
  await expect(page.locator('.household-bar__numbers')).toHaveText('2 / 250')

  // Exactly one events.append call reaches "the script", carrying one event.
  await expect.poll(() => sheet.appendCalls.length).toBe(1)
  expect(sheet.appendCalls[0]?.events).toHaveLength(1)
  const [sentEvent] = sheet.appendCalls[0]?.events ?? []
  expect(sentEvent).toMatchObject({ type: 'complete', taskId: expect.stringContaining('pots') })
  expect(typeof sentEvent?.id).toBe('string')

  // The current member is Ana, credited on "You today".
  await expect(page.locator('.log-screen__you-today')).toHaveText('You today: 2 pts')
})
