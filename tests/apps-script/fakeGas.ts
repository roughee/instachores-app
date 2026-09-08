/**
 * A tiny in-memory stand-in for the Apps Script globals (`SpreadsheetApp`,
 * `LockService`, `PropertiesService`, `ContentService`) used to load and
 * exercise `apps-script/Code.js` from Vitest. Only the surface `Code.js`
 * actually calls is implemented; nothing here talks to real Google APIs.
 */

/** A single Range: a rectangular window into a FakeSheet's backing grid. */
export class FakeRange {
  constructor(
    private readonly sheet: FakeSheet,
    private readonly row: number,
    private readonly col: number,
    private readonly numRows: number,
    private readonly numCols: number,
  ) {}

  getValues(): unknown[][] {
    const out: unknown[][] = []
    for (let r = 0; r < this.numRows; r++) {
      const line: unknown[] = []
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet.cell(this.row + r, this.col + c))
      out.push(line)
    }
    return out
  }

  setValues(values: unknown[][]): FakeRange {
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.setCell(this.row + r, this.col + c, v)))
    return this
  }

  setNumberFormat(format: string): FakeRange {
    this.sheet.formats.push({ row: this.row, col: this.col, numRows: this.numRows, numCols: this.numCols, format })
    return this
  }
}

/** A single tab: a grid of cells, 1-indexed like the real Sheets API. */
export class FakeSheet {
  private grid: unknown[][] = []
  readonly formats: { row: number; col: number; numRows: number; numCols: number; format: string }[] = []

  constructor(
    private readonly name: string,
    seedRows: unknown[][] = [],
  ) {
    seedRows.forEach((row) => this.grid.push(row.slice()))
  }

  getName(): string {
    return this.name
  }

  cell(row: number, col: number): unknown {
    const line = this.grid[row - 1]
    const v = line ? line[col - 1] : undefined
    return v === undefined ? '' : v
  }

  setCell(row: number, col: number, value: unknown): void {
    while (this.grid.length < row) this.grid.push([])
    const line = this.grid[row - 1]!
    while (line.length < col) line.push('')
    line[col - 1] = value
  }

  getLastRow(): number {
    return this.grid.length
  }

  getLastColumn(): number {
    return this.grid.reduce((max, row) => Math.max(max, row.length), 0)
  }

  getRange(row: number, col: number, numRows = 1, numCols = 1): FakeRange {
    return new FakeRange(this, row, col, numRows, numCols)
  }

  getDataRange(): FakeRange {
    return this.getRange(1, 1, this.getLastRow(), this.getLastColumn())
  }

  /** Snapshot of the raw grid, for assertions in tests. */
  snapshot(): unknown[][] {
    return this.grid.map((row) => row.slice())
  }
}

export class FakeSpreadsheet {
  private readonly sheets = new Map<string, FakeSheet>()
  private id = 'fake-spreadsheet'

  constructor(tabs: Record<string, unknown[][]> = {}) {
    Object.entries(tabs).forEach(([name, rows]) => this.sheets.set(name, new FakeSheet(name, rows)))
  }

  getId(): string {
    return this.id
  }

  getSheetByName(name: string): FakeSheet | null {
    return this.sheets.get(name) ?? null
  }

  insertSheet(name: string): FakeSheet {
    const sh = new FakeSheet(name)
    this.sheets.set(name, sh)
    return sh
  }

  getSheets(): FakeSheet[] {
    return [...this.sheets.values()]
  }
}

/** Tracks calls so tests can assert the lock was actually taken and released. */
export interface FakeLockState {
  tryLockCalls: number
  releaseCalls: number
  locked: boolean
}

export function createFakeLockService(opts: { tryLockSucceeds?: boolean } = {}): {
  LockService: { getScriptLock: () => { tryLock: (ms: number) => boolean; releaseLock: () => void } }
  state: FakeLockState
} {
  const state: FakeLockState = { tryLockCalls: 0, releaseCalls: 0, locked: false }
  const lock = {
    tryLock(_ms: number): boolean {
      state.tryLockCalls++
      const ok = opts.tryLockSucceeds !== false
      if (ok) state.locked = true
      return ok
    },
    releaseLock(): void {
      state.releaseCalls++
      state.locked = false
    },
  }
  return { LockService: { getScriptLock: () => lock }, state }
}

export function createFakePropertiesService(props: Record<string, string> = {}): {
  PropertiesService: {
    getScriptProperties: () => {
      getProperty: (k: string) => string | null
      setProperty: (k: string, v: string) => void
    }
  }
} {
  const store = { ...props }
  return {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => (k in store ? (store[k] ?? null) : null),
        setProperty: (k: string, v: string) => {
          store[k] = v
        },
      }),
    },
  }
}

export interface FakeTextOutput {
  setMimeType(mime: string): FakeTextOutput
  getContent(): string
}

export function createFakeContentService(): {
  ContentService: { MimeType: { JSON: string }; createTextOutput: (text: string) => FakeTextOutput }
} {
  return {
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput(text: string): FakeTextOutput {
        const out: FakeTextOutput = {
          setMimeType(_mime: string) {
            return out
          },
          getContent() {
            return text
          },
        }
        return out
      },
    },
  }
}

export function createFakeDriveApp(): {
  DriveApp: { getFileById: (id: string) => { setTrashed: (v: boolean) => void } }
} {
  return {
    DriveApp: {
      getFileById: (_id: string) => ({ setTrashed: (_v: boolean) => undefined }),
    },
  }
}

export function createFakeSpreadsheetApp(active: FakeSpreadsheet): {
  SpreadsheetApp: { getActiveSpreadsheet: () => FakeSpreadsheet; create: (name: string) => FakeSpreadsheet }
} {
  return {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => active,
      create: (_name: string) => new FakeSpreadsheet(),
    },
  }
}
