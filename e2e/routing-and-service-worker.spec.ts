/**
 * Issue #22: two things only the production build can prove.
 *  - A hash route survives a hard refresh (GitHub Pages has no rewrites,
 *    Architecture.md §9): `page.reload()` on `#/overview` must return the
 *    app, not a 404.
 *  - The service worker precaches the shell (`vite-plugin-pwa`,
 *    Architecture.md §9): once installed, a reload while offline still
 *    renders the app instead of the browser's own offline page.
 */
import { expect, test } from '@playwright/test'
import { MEMBERS, TASKS } from './support/household'
import { MockSheet, mockSetupLinkToken, routeMockSheet } from './support/mockSheet'

test('a hard refresh on a hash route returns the app, not a 404', async ({ page, context }) => {
  // A real connected session, not "Try the demo": `session.startDemo()`
  // deliberately never touches storage (src/stores/session.ts), so a demo
  // session cannot survive a reload -- that would test the wrong thing. Only
  // a `sheets`-mode session (persisted to `localStorage`) resumes across one.
  const sheet = new MockSheet({ members: MEMBERS, tasks: TASKS })
  await routeMockSheet(context, sheet)
  const token = mockSetupLinkToken()

  await page.goto(`#/welcome?s=${token}`)
  await page.getByTestId('connect-button').click()
  await page.getByTestId('member-list').waitFor()
  await page.getByTestId('member-button').filter({ hasText: 'Ana' }).click()
  await page.waitForURL(/#\/log$/)

  await page.goto('#/overview')
  await expect(page.getByRole('button', { name: 'Previous week' })).toBeVisible()

  const response = await page.reload()
  expect(response?.status()).toBeLessThan(400)
  await expect(page.getByRole('button', { name: 'Previous week' })).toBeVisible()
})

test('the service worker serves the app shell when the page reloads offline', async ({ page, context }) => {
  await page.goto('#/welcome')
  await page.getByText('Connect your household').waitFor()

  // Wait for the worker to install and activate, then reload once (still
  // online) so *this* page becomes controlled -- the first load that
  // registers a worker is never itself controlled by it.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15_000 })

  await context.setOffline(true)
  try {
    const response = await page.reload()
    expect(response?.status()).toBeLessThan(400)
    await page.getByText('Connect your household').waitFor()
  } finally {
    await context.setOffline(false)
  }
})
