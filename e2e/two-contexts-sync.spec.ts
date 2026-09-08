/**
 * Issue #22: an event appended by one phone (context A) appears in another
 * phone's (context B) Today list within one poll interval. The real cadence
 * is 30s (`POLL_INTERVAL_MS`, `src/data/sheetsRepo.ts`); this shortens it
 * with the dev-only `?pollMs=` flag (`src/composables/usePwa.ts`,
 * `src/main.ts`) so the test does not wait 30 real seconds.
 */
import { expect, test } from '@playwright/test'
import { MEMBERS, TASKS } from './support/household'
import { MockSheet, mockSetupLinkToken, routeMockSheet } from './support/mockSheet'

const POLL_MS = 1000

test('an event logged in one browser context appears in another context within one poll interval', async ({
  browser,
  baseURL,
}) => {
  const sheet = new MockSheet({ members: MEMBERS, tasks: TASKS })
  const token = mockSetupLinkToken()

  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  await routeMockSheet(contextA, sheet)
  await routeMockSheet(contextB, sheet)

  try {
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    // Phone A: Ana. Phone B: Ben, on the same mocked household.
    await pageA.goto(`${baseURL}?pollMs=${POLL_MS}#/welcome?s=${token}`)
    await pageA.getByTestId('connect-button').click()
    await pageA.getByTestId('member-list').waitFor()
    await pageA.getByTestId('member-button').filter({ hasText: 'Ana' }).click()
    await pageA.waitForURL(/#\/log$/)

    await pageB.goto(`${baseURL}?pollMs=${POLL_MS}#/welcome?s=${token}`)
    await pageB.getByTestId('connect-button').click()
    await pageB.getByTestId('member-list').waitFor()
    await pageB.getByTestId('member-button').filter({ hasText: 'Ben' }).click()
    await pageB.waitForURL(/#\/log$/)

    await pageB.goto(`${baseURL}?pollMs=${POLL_MS}#/today`)
    await expect(pageB.getByText('Quiet so far')).toBeVisible()

    // Phone A logs "Pots".
    await pageA.getByTestId('task-button').first().click()
    await expect.poll(() => sheet.appendCalls.length).toBe(1)

    // Phone B sees it on its own Today list within one poll (allow a couple
    // of intervals of slack for the mocked round trip).
    await expect(pageB.locator('.today-row')).toBeVisible({ timeout: POLL_MS * 3 })
    await expect(pageB.locator('.today-row')).toContainText('Pots')
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
