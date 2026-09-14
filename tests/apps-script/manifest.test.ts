/**
 * Guards against a manifest scope or a leftover Drive/scratch-spreadsheet
 * dependency creeping back into `apps-script/Code.js` (issue #85):
 * `runTests` now works against the configured sheet's own scratch tabs, so
 * neither `DriveApp` nor `SpreadsheetApp.create` should ever appear there
 * again, and the manifest should ask for exactly the one scope the script
 * needs.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../..')

describe('apps-script/appsscript.json oauth scopes (issue #85)', () => {
  it('grants exactly the spreadsheets scope', () => {
    const manifest = JSON.parse(readFileSync(path.join(root, 'apps-script/appsscript.json'), 'utf8')) as {
      oauthScopes?: unknown
    }

    expect(manifest.oauthScopes).toEqual(['https://www.googleapis.com/auth/spreadsheets'])
  })
})

describe('apps-script/Code.js has no Drive or scratch-spreadsheet dependency (issue #85)', () => {
  const source = readFileSync(path.join(root, 'apps-script/Code.js'), 'utf8')

  it('never references DriveApp', () => {
    expect(source).not.toContain('DriveApp')
  })

  it('never creates a scratch spreadsheet with SpreadsheetApp.create', () => {
    expect(source).not.toContain('SpreadsheetApp.create')
  })
})
