/**
 * Issue #22: light/dark screenshots of Log and Overview, captured as test
 * artifacts (`testInfo.outputPath`, uploaded by CI), and a colour audit of
 * both screens -- every computed `color`/`background-color` must come from
 * a token in `tokens.css`, or be the documented member-color exception (see
 * `e2e/support/colorAudit.ts`).
 */
import { expect, test } from '@playwright/test'
import { auditTokenColors } from './support/colorAudit'
import { MEMBERS, TASKS } from './support/household'
import { MockSheet, mockSetupLinkToken, routeMockSheet } from './support/mockSheet'

for (const scheme of ['light', 'dark'] as const) {
  test(`Log and Overview render every colour from a token, in ${scheme} (screenshots as artifacts)`, async ({
    browser,
  }, testInfo) => {
    const sheet = new MockSheet({ members: MEMBERS, tasks: TASKS })
    // `reducedMotion: 'reduce'` zeroes tokens.css's `--dur-*` durations, so
    // the audit never catches the nav tab's `color` transition (or any
    // other) mid-frame between two token values -- a real, if brief, cause
    // of a false positive otherwise.
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    })
    await routeMockSheet(context, sheet)

    try {
      const page = await context.newPage()
      const token = mockSetupLinkToken()
      await page.goto(`#/welcome?s=${token}`)
      await page.getByTestId('connect-button').click()
      await page.getByTestId('member-list').waitFor()
      await page.getByTestId('member-button').filter({ hasText: 'Ana' }).click()
      await page.waitForURL(/#\/log$/)

      // A couple of logged tasks so both screens show real data, not the
      // empty state.
      const taskButtons = page.getByTestId('task-button')
      await taskButtons.nth(0).click()
      await taskButtons.nth(1).click()
      await expect(page.locator('.household-bar__numbers')).toHaveText('5 / 250')

      await page.screenshot({ path: testInfo.outputPath(`log-${scheme}.png`) })
      const logOffenders = await auditTokenColors(page)
      expect(logOffenders, `Log screen (${scheme}) has non-token colours: ${JSON.stringify(logOffenders)}`).toEqual([])

      await page.goto('#/overview')
      await expect(page.getByRole('button', { name: 'Previous week' })).toBeVisible()

      await page.screenshot({ path: testInfo.outputPath(`overview-${scheme}.png`) })
      const overviewOffenders = await auditTokenColors(page)
      expect(
        overviewOffenders,
        `Overview screen (${scheme}) has non-token colours: ${JSON.stringify(overviewOffenders)}`,
      ).toEqual([])
    } finally {
      await context.close()
    }
  })
}
