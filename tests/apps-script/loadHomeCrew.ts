/**
 * Loads `apps-script/Code.js` into this Vitest process and hands back the
 * `HomeCrew` namespace it attaches to `globalThis`.
 *
 * Code.js is plain, unbundled Apps Script JavaScript (no `import`/`export`,
 * no modules) because that is what the Apps Script editor and `clasp push`
 * require. To reach it from Node without a build step, this evaluates the
 * file text with `new Function`, passing the Apps Script globals
 * (`SpreadsheetApp`, `LockService`, `PropertiesService`, `ContentService`,
 * `DriveApp`) in as parameters so Code.js's top-level functions close over
 * the fakes exactly as they close over the real services in production.
 * Code.js finishes by assigning its testable surface to
 * `globalThis.HomeCrew`, which is the only thing that survives the call.
 * See apps-script/README.md ("How this gets tested") for the rationale.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const CODE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps-script', 'Code.js')
const SOURCE = readFileSync(CODE_PATH, 'utf8')

export interface HomeCrewNamespace {
  VERSION: string
  HEADERS: Record<string, string[]>
  ACTIONS: Record<string, (ctx: unknown, req: unknown) => unknown>
  rowToObject: (headers: string[], row: unknown[]) => Record<string, unknown>
  objectToRow: (headers: string[], obj: Record<string, unknown>) => unknown[]
  readTable: (sheet: unknown) => { headers: string[]; objects: Record<string, unknown>[] }
  makeCtx: (ss: unknown, LockServiceRef: unknown, PropertiesServiceRef: unknown) => unknown
  handleRequest: (ctx: unknown, req: unknown) => { setMimeType(mime: string): unknown; getContent(): string }
  setupTemplate_: (ss: unknown) => unknown
  setupTemplate: () => unknown
  runTests: () => void
}

export function loadHomeCrew(gas: {
  SpreadsheetApp: unknown
  LockService: unknown
  PropertiesService: unknown
  ContentService: unknown
  DriveApp: unknown
}): HomeCrewNamespace {
  const run = new Function('SpreadsheetApp', 'LockService', 'PropertiesService', 'ContentService', 'DriveApp', SOURCE)
  run(gas.SpreadsheetApp, gas.LockService, gas.PropertiesService, gas.ContentService, gas.DriveApp)
  const globalAny = globalThis as unknown as { HomeCrew?: HomeCrewNamespace }
  const HomeCrew = globalAny.HomeCrew
  delete globalAny.HomeCrew
  if (!HomeCrew) throw new Error('apps-script/Code.js did not attach globalThis.HomeCrew')
  return HomeCrew
}
