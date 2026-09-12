/**
 * HomeCrew Apps Script backend. The only API in front of the household
 * sheet. See apps-script/README.md for the sheet template and the deploy
 * procedure, and docs/Architecture.md §5 for the action table this file
 * implements exactly.
 *
 * Layout of this file:
 *   1. Constants: VERSION, HEADERS (tab name -> header row, matching the
 *      Zod field names in src/schemas/).
 *   2. Pure helpers: generic row <-> object mapping, error construction.
 *      These never touch an Apps Script global directly; they take plain
 *      sheet-like objects (getRange/getLastRow/getLastColumn), so the same
 *      code runs against a real Sheet or against a fake in tests.
 *   3. Action handlers, each `(ctx, params) -> result`. `ctx` is the seam:
 *      `ctx.sheet(name)`, `ctx.lock()`, `ctx.secret()`. In production `ctx`
 *      wraps the real SpreadsheetApp/LockService/PropertiesService; in
 *      tests/apps-script/handlers.test.ts it wraps an in-memory fake.
 *   4. `handleRequest(ctx, req)`: secret check, dispatch, error mapping.
 *      This is what both `doPost` and the tests call.
 *   5. Apps Script entry points: `doPost`, `setupTemplate_`, `test_`. These
 *      are the only things that reach out to the real global services.
 *   6. `globalThis.HomeCrew = {...}` — see "How this gets tested" below.
 *
 * How this gets tested
 * ---------------------
 * Apps Script cannot run in this repo's CI. Code.js has no `import`/
 * `export` (Apps Script does not support modules), so
 * tests/apps-script/loadHomeCrew.ts loads this file into Vitest with
 * `new Function('SpreadsheetApp', 'LockService', 'PropertiesService',
 * 'ContentService', 'DriveApp', source)`, passing in fakes for those five
 * parameters (tests/apps-script/fakeGas.ts). The functions below are
 * declared inside that same `new Function` body, so they close over the
 * fakes exactly as they close over the real globals when Apps Script loads
 * this file. The line at the very bottom assigns the testable surface to
 * `globalThis.HomeCrew`, which is the one thing that survives the call and
 * the one thing the tests import. This was chosen over structuring the
 * whole file as a `new Function(...)`-returned value because Apps Script
 * itself requires `doPost`, `setupTemplate` and `runTests` to be ordinary
 * top-level function declarations (that is how the editor's "run function"
 * picker and the web app trigger find them; names ending in `_` are hidden
 * from that picker, which is why the public wrappers exist) — so the file has to look like
 * a normal .gs file first, and the globalThis assignment is added on top,
 * not instead.
 */

// ---------------------------------------------------------------------------
// 1. Constants
// ---------------------------------------------------------------------------

var VERSION = '1.0.0'

var HEADERS = {
  household: ['key', 'value'],
  members: ['uid', 'name', 'color', 'role'],
  tasks: [
    'v',
    'id',
    'name',
    'category',
    'points',
    'freq',
    'forRole',
    'parentId',
    'comboBonus',
    'intervalDays',
    'archived',
    'sort',
    'updatedAt',
    'updatedBy',
  ],
  rewards: ['v', 'id', 'name', 'cost', 'kind', 'commitment', 'archived', 'updatedAt', 'updatedBy'],
  events: [
    'v',
    'id',
    'type',
    'actorUid',
    'at',
    'loggedAt',
    'note',
    'taskId',
    'forUid',
    'points',
    'refEventId',
    'rewardId',
    'cost',
    'combo',
    'day',
    'dueAt',
    'days',
  ],
}

/** Household fields the `household.update` action is allowed to touch. */
var HOUSEHOLD_EDITABLE_KEYS = ['name', 'weeklyTarget', 'tz']

// ---------------------------------------------------------------------------
// 2. Pure helpers
// ---------------------------------------------------------------------------

/** An Error carrying one of the API's error codes (unauthorized|conflict|invalid|locked). */
function apiError(code, message) {
  var err = new Error(message)
  err.code = code
  return err
}

/**
 * Row (array of cell values) -> object, by matching each cell to the header
 * in the same column. Values are returned as-is: the sheet already hands
 * back '' for an empty cell and 'TRUE'/'FALSE' for booleans, which is what
 * the client's Zod cell coercions (src/schemas/cells.ts) expect.
 */
function rowToObject(headers, row) {
  var obj = {}
  for (var i = 0; i < headers.length; i++) obj[headers[i]] = row[i] === undefined ? '' : row[i]
  return obj
}

/**
 * Object -> row (array of cell values), in header order. `undefined`/`null`
 * become '', booleans become 'TRUE'/'FALSE', Dates become ISO strings.
 * Anything else (numbers, strings already-ISO) passes through unchanged.
 */
function objectToRow(headers, obj) {
  return headers.map(function (h) {
    var v = obj[h]
    if (v === undefined || v === null) return ''
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
    if (v instanceof Date) return v.toISOString()
    return v
  })
}

/**
 * Reads a whole tab as { headers, objects, rows }. Blank rows are skipped;
 * `rows[i]` is the 1-indexed sheet row that `objects[i]` came from, so a
 * write-back never lands on the wrong row when a blank row sits in between.
 * Header-only or empty tabs answer objects: [].
 */
function readTable(sheet) {
  var lastRow = sheet.getLastRow()
  var lastCol = sheet.getLastColumn()
  if (lastRow < 1 || lastCol < 1) return { headers: [], objects: [], rows: [] }
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
  if (lastRow < 2) return { headers: headers, objects: [], rows: [] }
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues()
  var objects = []
  var rows = []
  values.forEach(function (row, i) {
    var blank = !row.some(function (cell) {
      return cell !== '' && cell !== undefined && cell !== null
    })
    if (blank) return
    objects.push(rowToObject(headers, row))
    rows.push(i + 2)
  })
  return { headers: headers, objects: objects, rows: rows }
}

/** Appends objects as new rows below the last row. Returns the first row written, or null if nothing was appended. */
function appendRows(sheet, headers, objects) {
  if (!objects.length) return null
  var startRow = sheet.getLastRow() + 1
  var values = objects.map(function (o) {
    return objectToRow(headers, o)
  })
  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values)
  return startRow
}

/** Same as appendRows, but also stamps the plain-text ('@') number format on the rows it writes. */
function appendRowsPlainText(sheet, headers, objects) {
  var startRow = appendRows(sheet, headers, objects)
  if (startRow) sheet.getRange(startRow, 1, objects.length, headers.length).setNumberFormat('@')
  return startRow
}

/** Overwrites one existing data row (1-indexed sheet row, from readTable's `rows`) in place. */
function writeRowAt(sheet, rowIndex, headers, obj) {
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([objectToRow(headers, obj)])
}

/** Reads the household tab's key/value rows (row 1 is the 'key','value' header) into a plain object. */
function readHousehold(ctx) {
  var sh = ctx.sheet('household')
  var lastRow = sh.getLastRow()
  var obj = {}
  if (lastRow >= 2) {
    var rows = sh.getRange(2, 1, lastRow - 1, 2).getValues()
    rows.forEach(function (r) {
      if (r[0] !== '' && r[0] !== undefined && r[0] !== null) obj[r[0]] = r[1]
    })
  }
  return obj
}

/** Updates (or appends) key/value rows on the household tab. */
function writeHouseholdFields(ctx, updates) {
  var sh = ctx.sheet('household')
  var lastRow = sh.getLastRow()
  var keys =
    lastRow >= 2
      ? sh
          .getRange(2, 1, lastRow - 1, 1)
          .getValues()
          .map(function (r) {
            return r[0]
          })
      : []
  Object.keys(updates).forEach(function (key) {
    var raw = updates[key]
    var value = raw instanceof Date ? raw.toISOString() : typeof raw === 'boolean' ? (raw ? 'TRUE' : 'FALSE') : raw
    var idx = keys.indexOf(key)
    if (idx >= 0) {
      sh.getRange(idx + 2, 2, 1, 1).setValues([[value]])
    } else {
      var newRow = sh.getLastRow() + 1
      sh.getRange(newRow, 1, 1, 2).setValues([[key, value]])
      keys.push(key)
    }
  })
}

/** Throws `invalid` unless the event has a non-empty id, in-range points, and a known actorUid. */
function validateEvent(ev, memberUids) {
  if (!ev || typeof ev.id !== 'string' || ev.id.length === 0) throw apiError('invalid', 'event is missing an id')
  if (ev.points !== undefined && ev.points !== null && ev.points !== '') {
    var points = Number(ev.points)
    if (isNaN(points) || points < 0 || points > 50) throw apiError('invalid', 'points out of range for event ' + ev.id)
  }
  if (!ev.actorUid || !memberUids[ev.actorUid]) throw apiError('invalid', 'unknown actorUid for event ' + ev.id)
}

// ---------------------------------------------------------------------------
// 3. Action handlers — each is (ctx, params) -> result
// ---------------------------------------------------------------------------

function bootstrap(ctx, params) {
  var household = readHousehold(ctx)
  var members = readTable(ctx.sheet('members')).objects
  var tasks = readTable(ctx.sheet('tasks')).objects
  var rewards = readTable(ctx.sheet('rewards')).objects
  var since = eventsSince(ctx, { since: params.since })
  return {
    household: household,
    members: members,
    tasks: tasks,
    rewards: rewards,
    events: since.events,
    serverTime: since.serverTime,
  }
}

/**
 * The poll. Filters by loggedAt >= since - 1s, so a row appended in the same
 * second as the cursor is never missed at the boundary (docs/Architecture.md
 * §5); the client dedupes by id, so the one-second overlap is harmless.
 */
function eventsSince(ctx, params) {
  var since = params.since ? new Date(params.since) : new Date(0)
  var cutoff = new Date(since.getTime() - 1000)
  var events = readTable(ctx.sheet('events')).objects.filter(function (o) {
    var loggedAt = new Date(o.loggedAt)
    return !isNaN(loggedAt.getTime()) && loggedAt.getTime() >= cutoff.getTime()
  })
  return { events: events, serverTime: new Date().toISOString() }
}

/**
 * Appends new events under the script lock, skipping ids already present.
 * The whole batch is validated before the lock is taken, so an invalid
 * batch never blocks on, or holds, the lock.
 */
function eventsAppend(ctx, params) {
  var events = params.events || []
  var memberUids = {}
  readTable(ctx.sheet('members')).objects.forEach(function (m) {
    memberUids[m.uid] = true
  })
  events.forEach(function (ev) {
    validateEvent(ev, memberUids)
  })

  var lock = ctx.lock()
  if (!lock.tryLock(10000)) throw apiError('locked', 'could not acquire the script lock')
  try {
    var sh = ctx.sheet('events')
    var existingIds = {}
    readTable(sh).objects.forEach(function (o) {
      existingIds[o.id] = true
    })
    var loggedAt = new Date().toISOString()
    var appended = []
    var skipped = []
    var fresh = []
    events.forEach(function (ev) {
      if (existingIds[ev.id]) {
        skipped.push(ev.id)
        return
      }
      existingIds[ev.id] = true
      fresh.push(Object.assign({}, ev, { loggedAt: loggedAt }))
      appended.push(ev.id)
    })
    if (fresh.length) appendRowsPlainText(sh, HEADERS.events, fresh)
    return { appended: appended, skipped: skipped, loggedAt: loggedAt }
  } finally {
    lock.releaseLock()
  }
}

/** Shared by tasks.upsert and rewards.upsert: insert if new, else write-if-newer or conflict. */
function genericUpsert(ctx, tabName, incoming) {
  if (!incoming || !incoming.id) throw apiError('invalid', 'missing id')
  var sh = ctx.sheet(tabName)
  var headers = HEADERS[tabName]
  var table = readTable(sh)
  var idx = -1
  for (var i = 0; i < table.objects.length; i++) {
    if (table.objects[i].id === incoming.id) {
      idx = i
      break
    }
  }
  if (idx === -1) {
    appendRowsPlainText(sh, headers, [incoming])
    return incoming
  }
  var existing = table.objects[idx]
  var existingUpdatedAt = new Date(existing.updatedAt)
  var incomingUpdatedAt = new Date(incoming.updatedAt)
  if (!isNaN(existingUpdatedAt.getTime()) && incomingUpdatedAt.getTime() < existingUpdatedAt.getTime()) {
    throw apiError('conflict', 'stale updatedAt for ' + incoming.id)
  }
  writeRowAt(sh, table.rows[idx], headers, incoming)
  return incoming
}

function tasksUpsert(ctx, params) {
  return { task: genericUpsert(ctx, 'tasks', params.task) }
}

function rewardsUpsert(ctx, params) {
  return { reward: genericUpsert(ctx, 'rewards', params.reward) }
}

function householdUpdate(ctx, params) {
  var updates = {}
  HOUSEHOLD_EDITABLE_KEYS.forEach(function (key) {
    if (params[key] !== undefined) updates[key] = params[key]
  })
  writeHouseholdFields(ctx, updates)
  return { household: readHousehold(ctx) }
}

/** Fills empty tasks and rewards tabs. Refuses (`invalid`) unless both are empty. */
function seed(ctx, params) {
  var tasksSheet = ctx.sheet('tasks')
  var rewardsSheet = ctx.sheet('rewards')
  var tasksNotEmpty = readTable(tasksSheet).objects.length > 0
  var rewardsNotEmpty = readTable(rewardsSheet).objects.length > 0
  if (tasksNotEmpty || rewardsNotEmpty) throw apiError('invalid', 'tasks and rewards must be empty to seed')
  var tasks = params.tasks || []
  var rewards = params.rewards || []
  appendRowsPlainText(tasksSheet, HEADERS.tasks, tasks)
  appendRowsPlainText(rewardsSheet, HEADERS.rewards, rewards)
  return { tasks: tasks.length, rewards: rewards.length }
}

function version(ctx, params) {
  return { version: VERSION }
}

var ACTIONS = {
  bootstrap: bootstrap,
  'events.since': eventsSince,
  'events.append': eventsAppend,
  'tasks.upsert': tasksUpsert,
  'rewards.upsert': rewardsUpsert,
  'household.update': householdUpdate,
  seed: seed,
  version: version,
}

// ---------------------------------------------------------------------------
// 4. Router
// ---------------------------------------------------------------------------

/**
 * Builds the seam handlers depend on: `sheet(name)`, `lock()`, `secret()`.
 * `ss` is a Spreadsheet (real or fake); `LockServiceRef`/`PropertiesServiceRef`
 * are passed in rather than read from the closure so the same code runs in
 * production and in tests.
 */
function makeCtx(ss, LockServiceRef, PropertiesServiceRef) {
  return {
    sheet: function (name) {
      var sh = ss.getSheetByName(name)
      if (!sh) throw apiError('invalid', 'missing tab: ' + name)
      return sh
    },
    lock: function () {
      return LockServiceRef.getScriptLock()
    },
    secret: function () {
      return PropertiesServiceRef.getScriptProperties().getProperty('SECRET')
    },
  }
}

/**
 * Secret check, dispatch, error mapping. Returns a ContentService text
 * output, JSON-encoded, exactly as `doPost` must. Never throws: every
 * failure path is caught and turned into `{ ok: false, code, message }`.
 */
function handleRequest(ctx, req) {
  var secret = ctx.secret()
  if (!req || !secret || req.secret !== secret) {
    return jsonOutput({ ok: false, code: 'unauthorized' })
  }
  var handler = ACTIONS[req.action]
  if (!handler) return jsonOutput({ ok: false, code: 'invalid', message: 'unknown action: ' + req.action })
  try {
    var result = handler(ctx, req) || {}
    return jsonOutput(Object.assign({ ok: true }, result))
  } catch (err) {
    return jsonOutput({ ok: false, code: err.code || 'invalid', message: String((err && err.message) || err) })
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

// ---------------------------------------------------------------------------
// 5. Apps Script entry points
// ---------------------------------------------------------------------------

/** The web app entry point. Apps Script only supports doPost/doGet as globals bound to the deployment. */
function doPost(e) {
  var req
  try {
    req = JSON.parse(e.postData.contents)
  } catch (err) {
    return jsonOutput({ ok: false, code: 'invalid', message: 'body is not valid JSON' })
  }
  var ctx = makeCtx(SpreadsheetApp.getActiveSpreadsheet(), LockService, PropertiesService)
  return handleRequest(ctx, req)
}

/**
 * Creates the five tabs with header rows matching the Zod field names, and
 * marks their columns as plain text. Run once from the script editor
 * against a brand-new spreadsheet to produce the household's sheet from the
 * template (see apps-script/README.md).
 */
function setupTemplate_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet()
  var tabs = {
    household: HEADERS.household,
    members: HEADERS.members,
    tasks: HEADERS.tasks,
    rewards: HEADERS.rewards,
    events: HEADERS.events,
  }
  Object.keys(tabs).forEach(function (name) {
    var headers = tabs[name]
    var sh = ss.getSheetByName(name) || ss.insertSheet(name)
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
    sh.getRange(1, 1, 2000, headers.length).setNumberFormat('@')
    if (sh.setFrozenRows) sh.setFrozenRows(1)
  })
  return ss
}

/**
 * Public entry point for the editor's Run picker (issue #49). Apps Script
 * hides every function whose name ends in `_` from that picker, so the
 * helper above cannot be selected directly. This wrapper is what the
 * procedure in docs/Setup.md tells the human to run; it always acts on the
 * bound (active) spreadsheet.
 */
function setupTemplate() {
  return setupTemplate_()
}

/**
 * Public entry point for `test_()` below, for the same reason as
 * `setupTemplate()` (issue #49). Select `runTests` in the Run picker before
 * every deploy.
 */
function runTests() {
  test_()
}

/**
 * Runs the acceptance scenarios against a scratch spreadsheet, logs
 * PASS/FAIL per scenario, and trashes the scratch file when done. Run this
 * from the Apps Script editor (select `test_`, then Run) before every
 * deploy. See apps-script/README.md, "Before you deploy".
 */
function test_() {
  var ss = SpreadsheetApp.create('homecrew-test-scratch-' + new Date().getTime())
  var results = []
  function check(name, ok, detail) {
    results.push({ name: name, ok: !!ok, detail: detail })
    Logger.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (detail ? ' (' + detail + ')' : ''))
  }

  try {
    setupTemplate_(ss)
    var members = ss.getSheetByName('members')
    members.getRange(2, 1, 2, HEADERS.members.length).setValues([
      ['ana', 'Ana', '#1f8a70', 'adult'],
      ['ben', 'Ben', '#3f6fd4', 'adult'],
    ])
    var ctx = {
      sheet: function (name) {
        var sh = ss.getSheetByName(name)
        if (!sh) throw apiError('invalid', 'missing tab: ' + name)
        return sh
      },
      lock: function () {
        return LockService.getScriptLock()
      },
      secret: function () {
        return 'scratch-secret'
      },
    }

    // 1. Wrong secret is rejected and touches nothing.
    var eventsBefore = readTable(ss.getSheetByName('events')).objects.length
    var wrong = JSON.parse(
      handleRequest(ctx, {
        secret: 'nope',
        action: 'events.append',
        events: [{ id: 'x', actorUid: 'ana', type: 'complete', points: 1 }],
      }).getContent(),
    )
    check(
      'wrong secret is rejected and touches nothing',
      wrong.ok === false &&
        wrong.code === 'unauthorized' &&
        readTable(ss.getSheetByName('events')).objects.length === eventsBefore,
    )

    // 2. events.append: two duplicates, one new -> exactly one row appended.
    var e1 = {
      v: 1,
      id: 'e1',
      type: 'complete',
      actorUid: 'ana',
      at: new Date().toISOString(),
      taskId: 'pots',
      forUid: 'ana',
      points: 2,
    }
    handleRequest(ctx, { secret: 'scratch-secret', action: 'events.append', events: [e1] })
    var afterFirst = readTable(ss.getSheetByName('events')).objects.length
    var appendRes = JSON.parse(
      handleRequest(ctx, {
        secret: 'scratch-secret',
        action: 'events.append',
        events: [
          e1,
          e1,
          {
            v: 1,
            id: 'e2',
            type: 'complete',
            actorUid: 'ben',
            at: new Date().toISOString(),
            taskId: 'counters',
            forUid: 'ben',
            points: 3,
          },
        ],
      }).getContent(),
    )
    var afterSecond = readTable(ss.getSheetByName('events')).objects.length
    check(
      'events.append appends exactly one new row and reports appended+skipped',
      appendRes.appended.length === 1 &&
        appendRes.skipped.length === 2 &&
        afterSecond === afterFirst + 1 &&
        !!appendRes.loggedAt,
    )

    // 3. events.since returns only rows after the cursor, plus serverTime.
    var sinceRes = JSON.parse(
      handleRequest(ctx, { secret: 'scratch-secret', action: 'events.since', since: appendRes.loggedAt }).getContent(),
    )
    check(
      'events.since filters by loggedAt and includes serverTime',
      Array.isArray(sinceRes.events) && !!sinceRes.serverTime,
    )

    // 4. tasks.upsert: stale updatedAt is a conflict and leaves the row unchanged.
    var task = {
      v: 1,
      id: 'task-1',
      name: 'Pots',
      category: 'kitchen',
      points: 2,
      freq: 'daily',
      forRole: 'adult',
      archived: false,
      sort: 0,
      updatedAt: new Date().toISOString(),
      updatedBy: 'ana',
    }
    handleRequest(ctx, { secret: 'scratch-secret', action: 'tasks.upsert', task: task })
    var stale = Object.assign({}, task, { name: 'Renamed', updatedAt: '2000-01-01T00:00:00.000Z' })
    var conflictRes = JSON.parse(
      handleRequest(ctx, { secret: 'scratch-secret', action: 'tasks.upsert', task: stale }).getContent(),
    )
    var storedTask = readTable(ss.getSheetByName('tasks')).objects.filter(function (t) {
      return t.id === 'task-1'
    })[0]
    check(
      'tasks.upsert conflicts on a stale updatedAt and leaves the row unchanged',
      conflictRes.ok === false && conflictRes.code === 'conflict' && storedTask.name === 'Pots',
    )

    // 5. seed fills empty tabs, then refuses a second time.
    var seedRes = JSON.parse(
      handleRequest(ctx, {
        secret: 'scratch-secret',
        action: 'seed',
        tasks: [],
        rewards: [
          {
            v: 1,
            id: 'r1',
            name: 'Bath',
            cost: 15,
            kind: 'solo',
            archived: false,
            updatedAt: new Date().toISOString(),
            updatedBy: 'ana',
          },
        ],
      }).getContent(),
    )
    var reseedRes = JSON.parse(
      handleRequest(ctx, { secret: 'scratch-secret', action: 'seed', tasks: [], rewards: [] }).getContent(),
    )
    check(
      'seed fills empty tabs then refuses once seeded',
      seedRes.ok === true && seedRes.rewards === 1 && reseedRes.ok === false && reseedRes.code === 'invalid',
    )

    // 6. Lock is released on an error path: force a broken sheet lookup mid-handler.
    var brokenCtx = {
      sheet: function (name) {
        if (name === 'events') throw new Error('simulated failure reading events')
        return ctx.sheet(name)
      },
      lock: ctx.lock,
      secret: ctx.secret,
    }
    var beforeLockTest = LockService.getScriptLock()
    var lockAcquiredBeforeTest = beforeLockTest.tryLock(1000)
    if (lockAcquiredBeforeTest) beforeLockTest.releaseLock()
    var failing = JSON.parse(
      handleRequest(brokenCtx, {
        secret: 'scratch-secret',
        action: 'events.append',
        events: [
          {
            v: 1,
            id: 'e3',
            type: 'complete',
            actorUid: 'ana',
            at: new Date().toISOString(),
            taskId: 'pots',
            forUid: 'ana',
            points: 1,
          },
        ],
      }).getContent(),
    )
    var lockAfterTest = LockService.getScriptLock()
    var lockFreeAfter = lockAfterTest.tryLock(1000)
    if (lockFreeAfter) lockAfterTest.releaseLock()
    check('the lock is released on an error path', failing.ok === false && lockAcquiredBeforeTest && lockFreeAfter)
  } finally {
    try {
      DriveApp.getFileById(ss.getId()).setTrashed(true)
    } catch (cleanupErr) {
      Logger.log('could not trash scratch spreadsheet: ' + cleanupErr)
    }
  }

  var failed = results.filter(function (r) {
    return !r.ok
  })
  Logger.log(failed.length === 0 ? 'ALL PASS (' + results.length + ')' : failed.length + ' FAILED of ' + results.length)
  return results
}

// ---------------------------------------------------------------------------
// 6. Test seam — see "How this gets tested" above.
// ---------------------------------------------------------------------------
if (typeof globalThis !== 'undefined') {
  globalThis.HomeCrew = {
    VERSION: VERSION,
    HEADERS: HEADERS,
    ACTIONS: ACTIONS,
    rowToObject: rowToObject,
    objectToRow: objectToRow,
    readTable: readTable,
    appendRows: appendRows,
    makeCtx: makeCtx,
    handleRequest: handleRequest,
    setupTemplate_: setupTemplate_,
    setupTemplate: setupTemplate,
    runTests: runTests,
  }
}
