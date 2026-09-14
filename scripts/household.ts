#!/usr/bin/env -S node --experimental-strip-types
/**
 * HomeCrew household setup CLI (issue #13). Everything the ten-minute
 * procedure in docs/Setup.md can hand to a script instead of a human: a
 * fresh secret, a check that the deployed Apps Script answers correctly,
 * seeding the catalog, formatting the members rows, and building the setup
 * link. What it cannot do — creating the sheet, pasting Code.js, running
 * setupTemplate, deploying — stays a human click in the Apps Script editor
 * (docs/Architecture.md §5, §7).
 *
 * Run with `npm run household -- <command> [flags]`. See USAGE below, or run
 * with no command, for the flags each subcommand takes.
 *
 * Executed with `tsx` (see package.json's "household" script): plain
 * `node --experimental-strip-types` cannot resolve the `@/*` alias that
 * src/domain/seed.ts and src/schemas/index.ts import through, because type
 * stripping does not do module resolution — only tsx's loader reads
 * tsconfig.json's `paths`. This file itself uses relative imports with
 * explicit `.ts` extensions so it would also run directly under
 * `node --experimental-strip-types` if those two files ever drop the alias.
 *
 * IO (network, stdin, argv) lives in the `cmd*` functions and `main()`,
 * guarded to run only when this file is the entry point. Everything else —
 * argument parsing, member row validation and formatting, link building, the
 * check-result evaluation — is a pure function exported for
 * tests/scripts/household.test.ts to call directly.
 */
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'

import { seedRewards, seedTasks } from '../src/domain/seed.ts'
import { Member, SetupLink, encodeSetupLink } from '../src/schemas/index.ts'

const DEFAULT_APP = 'https://roughee.github.io/instachores-app/'
const MEMBER_HEADERS = ['uid', 'name', 'color', 'role'] as const

const USAGE = `homecrew household setup CLI

  npm run household -- secret
      Prints a fresh secret and the steps to store it as the SECRET script property.

  npm run household -- check --url <scriptUrl> [--secret <s>]
      Calls the version action with the right secret, then with a wrong one.
      Prints PASS/FAIL for each. Also calls bootstrap and reports whether the
      schedule columns (tasks.intervalDays, events.dueAt, events.days) show up
      on the sheet, or can't be told yet for lack of a row to check. Exits 1
      if either PASS/FAIL check fails; the schedule-column report never
      affects the exit code.

  npm run household -- seed --url <scriptUrl> [--secret <s>] [--by <uid>] [--dry-run] [--yes]
      Posts the seed catalog (src/domain/seed.ts) to the script in one call.
      --dry-run prints the counts and the first three rows of each tab and
      sends nothing. Without --dry-run or --yes, asks for confirmation first.
      Refuses (sends nothing) if the tasks or rewards tab already has rows;
      see --append below for adding to a sheet that already has some.

  npm run household -- seed --append --url <scriptUrl> [--secret <s>] [--by <uid>] [--dry-run] [--yes]
      Bootstraps the sheet, works out which seed tasks and rewards it is
      missing (by id), and inserts exactly those with one tasks.upsert or
      rewards.upsert call per row -- existing rows are never touched.
      --dry-run prints the rows that would be inserted, grouped by category,
      and sends nothing. Without --dry-run or --yes, asks for confirmation
      first; with nothing missing, prints that and exits without asking.

  npm run household -- members [--adult uid:Name:#hex ...] [--kid uid:Name:#hex ...]
      Validates each member and prints the rows to paste into the members
      tab by hand (there is no members action in the Apps Script API).

  npm run household -- link --url <scriptUrl> [--secret <s>] [--app <appUrl>]
      Prints the setup link to share with your partner.

--secret may also come from the HOMECREW_SECRET environment variable, so it
never has to land in shell history.
`

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

export interface ParsedArgs {
  command: string | undefined
  flags: Record<string, string[]>
}

/**
 * `--name value` pairs a flag with the next token unless that token is
 * itself a flag, in which case (and at end of input) the flag is recorded
 * present with value 'true' — enough for boolean switches like --dry-run.
 * A flag may repeat (`--adult a:A:#111 --adult b:B:#222`); order is kept.
 */
export function parseArgv(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv
  const flags: Record<string, string[]> = {}
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]
    if (token === undefined || !token.startsWith('--')) continue
    const name = token.slice(2)
    const next = rest[i + 1]
    const values = (flags[name] ??= [])
    if (next !== undefined && !next.startsWith('--')) {
      values.push(next)
      i++
    } else {
      values.push('true')
    }
  }
  return { command, flags }
}

export function flagValue(args: ParsedArgs, name: string): string | undefined {
  return args.flags[name]?.[0]
}

export function flagValues(args: ParsedArgs, name: string): string[] {
  return args.flags[name] ?? []
}

export function hasFlag(args: ParsedArgs, name: string): boolean {
  return name in args.flags
}

/** --secret, or HOMECREW_SECRET so the value need not land in shell history. Throws when neither is set. */
export function resolveSecret(
  flagSecret: string | undefined,
  env: Record<string, string | undefined> = process.env,
): string {
  const secret = flagSecret ?? env.HOMECREW_SECRET
  if (!secret) throw new Error('missing --secret (or set the HOMECREW_SECRET environment variable)')
  return secret
}

// ---------------------------------------------------------------------------
// secret
// ---------------------------------------------------------------------------

/** A fresh 32-character base64url secret (24 random bytes, no padding). */
export function generateSecret(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * The steps `secret` prints for storing the fresh value as the `SECRET`
 * Script Property, plus the `SHEET_ID` property (issue #85): the id from the
 * household spreadsheet's own URL, between `/d/` and `/edit`. Setting it
 * lets the deployed script open that sheet by id instead of relying on
 * being bound to it; leaving it unset keeps today's bound-spreadsheet
 * behaviour.
 */
export function formatSecretInstructions(secret: string): string {
  return [
    'Store it as a Script Property so the deployed script accepts it:',
    '  1. Open the household spreadsheet, then Extensions > Apps Script.',
    '  2. Project Settings (the gear icon) > Script Properties > Add script property.',
    '  3. Property: SECRET',
    `  4. Value:    ${secret}`,
    '  5. Save script properties.',
    '',
    'While there, also add a SHEET_ID property so the script opens this exact sheet:',
    '  1. Property: SHEET_ID',
    '  2. Value:    <the sheet id, from the spreadsheet URL between /d/ and /edit>',
    '  3. Save script properties.',
    'Without SHEET_ID, the script falls back to the spreadsheet it is bound to.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// members
// ---------------------------------------------------------------------------

/** Parses "uid:Name:#hex" into a validated Member with the given role. Throws a readable error otherwise. */
export function parseMemberSpec(spec: string, role: Member['role']): Member {
  const parts = spec.split(':')
  if (parts.length !== 3) {
    throw new Error(`--${role} "${spec}" must look like uid:Name:#hex, got ${parts.length} part(s) separated by ':'`)
  }
  const [uid, name, color] = parts
  const result = Member.safeParse({ uid, name, color, role })
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'member'}: ${issue.message}`)
      .join('; ')
    throw new Error(`--${role} "${spec}" is not a valid member (${detail})`)
  }
  return result.data
}

/** Tab-separated rows, header first, in the exact column order the members tab expects. */
export function formatMembersTable(members: Member[]): string {
  const lines = [MEMBER_HEADERS.join('\t'), ...members.map((m) => MEMBER_HEADERS.map((h) => m[h]).join('\t'))]
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// link
// ---------------------------------------------------------------------------

export function normalizeAppUrl(app: string): string {
  return app.endsWith('/') ? app : `${app}/`
}

/** Validates url+secret as a SetupLink, then builds the #/welcome URL the second phone opens. */
export function buildSetupLinkUrl(url: string, secret: string, app: string = DEFAULT_APP): string {
  const link = SetupLink.parse({ url, secret })
  return `${normalizeAppUrl(app)}#/welcome?s=${encodeSetupLink(link)}`
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

export interface CheckOutcome {
  name: string
  ok: boolean
  detail: string
}

export interface CheckSummary {
  outcomes: CheckOutcome[]
  allPass: boolean
  /** One readable line reporting which spreadsheet the script opened (issue #85). */
  sheetLine: string
}

const SHEET_SOURCE_LINES: Record<'property' | 'bound', string> = {
  property: 'sheet: opened by SHEET_ID',
  bound: 'sheet: bound spreadsheet (set SHEET_ID to pin it)',
}

/**
 * What `sheetLine` reports when the deployed script's `version` response has
 * no `sheetSource` at all -- an older deployment made before issue #85, which
 * `check` should still run against without crashing.
 */
const UNKNOWN_SHEET_SOURCE_LINE = 'sheet: unknown (redeploy the script to report which sheet it opened)'

/** Pure evaluation of the two `version` responses `check` collects: right secret ok, wrong secret unauthorized. */
export function evaluateCheckResults(rightSecretResponse: unknown, wrongSecretResponse: unknown): CheckSummary {
  const right = rightSecretResponse as { ok?: unknown; version?: unknown; sheetSource?: unknown } | null | undefined
  const rightOk = right != null && right.ok === true && typeof right.version === 'string'
  const rightOutcome: CheckOutcome = {
    name: 'the right secret is accepted',
    ok: rightOk,
    detail: rightOk
      ? `code ok, version ${String(right?.version)}`
      : `unexpected response ${JSON.stringify(rightSecretResponse)}`,
  }

  const wrong = wrongSecretResponse as { ok?: unknown; code?: unknown } | null | undefined
  const wrongOk = wrong != null && wrong.ok === false && wrong.code === 'unauthorized'
  const wrongOutcome: CheckOutcome = {
    name: 'a wrong secret is rejected',
    ok: wrongOk,
    detail: wrongOk ? 'code unauthorized' : `unexpected response ${JSON.stringify(wrongSecretResponse)}`,
  }

  const sheetSource = right?.sheetSource
  const sheetLine =
    sheetSource === 'property' || sheetSource === 'bound' ? SHEET_SOURCE_LINES[sheetSource] : UNKNOWN_SHEET_SOURCE_LINE

  const outcomes = [rightOutcome, wrongOutcome]
  return { outcomes, allPass: outcomes.every((o) => o.ok), sheetLine }
}

// ---------------------------------------------------------------------------
// check: schedule columns (issue #67)
// ---------------------------------------------------------------------------

export interface ScheduleColumnCheck {
  column: string
  /**
   * 'present'/'missing' only mean something when at least one row came back
   * to look at: `rowToObject` (apps-script/Code.js) sets every header's key
   * on every row it reads, blank cell or not, so the key's presence tells
   * whether the column exists in the sheet. With no rows at all -- an empty
   * tasks tab, or an events tab nobody has scheduled anything on yet -- there
   * is nothing to look at, and 'unknown' says so rather than reporting a
   * false 'missing' (Apps Script's request/response shapes stay unchanged,
   * so this is the most a `bootstrap` call can tell us).
   */
  status: 'present' | 'missing' | 'unknown'
}

function columnStatus(rows: unknown[], key: string): ScheduleColumnCheck['status'] {
  if (rows.length === 0) return 'unknown'
  return rows.some((row) => row !== null && typeof row === 'object' && key in row) ? 'present' : 'missing'
}

/**
 * Reports whether `bootstrap`'s tasks/events rows carry the schedule
 * columns added in issue #67 (`tasks.intervalDays`, `events.dueAt`,
 * `events.days`) — the closest existing verification `check` has, since no
 * new Apps Script action is allowed to expose sheet headers directly.
 */
export function checkScheduleColumns(bootstrap: { tasks?: unknown[]; events?: unknown[] }): ScheduleColumnCheck[] {
  const tasks = bootstrap.tasks ?? []
  const events = bootstrap.events ?? []
  return [
    { column: 'tasks.intervalDays', status: columnStatus(tasks, 'intervalDays') },
    { column: 'events.dueAt', status: columnStatus(events, 'dueAt') },
    { column: 'events.days', status: columnStatus(events, 'days') },
  ]
}

/** One readable line per `checkScheduleColumns` result, for `check`'s console output. */
export function formatScheduleColumnChecks(checks: ScheduleColumnCheck[]): string {
  const label: Record<ScheduleColumnCheck['status'], string> = {
    present: 'present',
    missing: 'MISSING -- see docs/Setup.md, "Adding the schedule columns to an existing sheet"',
    unknown:
      'cannot tell yet (no rows to check) -- see docs/Setup.md, "Adding the schedule columns to an existing sheet"',
  }
  return checks.map((c) => `  ${c.column}: ${label[c.status]}`).join('\n')
}

// ---------------------------------------------------------------------------
// seed
// ---------------------------------------------------------------------------

export interface SeedPayload {
  tasks: ReturnType<typeof seedTasks>
  rewards: ReturnType<typeof seedRewards>
}

export function buildSeedPayload(now: Date, by: string): SeedPayload {
  return { tasks: seedTasks(now, by), rewards: seedRewards(now, by) }
}

/** What --dry-run prints instead of sending: counts and the first three rows of each tab. */
export function formatSeedDryRun(payload: SeedPayload): string {
  return [
    `tasks: ${payload.tasks.length}`,
    `rewards: ${payload.rewards.length}`,
    '',
    'first 3 tasks:',
    ...payload.tasks.slice(0, 3).map((t) => `  ${JSON.stringify(t)}`),
    '',
    'first 3 rewards:',
    ...payload.rewards.slice(0, 3).map((r) => `  ${JSON.stringify(r)}`),
  ].join('\n')
}

/** The readable refusal `seed` prints when the script answers `invalid` because the tabs are not empty. */
export function describeSeedRefusal(response: { code?: string; message?: string }): string {
  return [
    'The script refused: the tasks and/or rewards tab already has rows.',
    response.message ? `Script said: ${response.message}` : undefined,
    'seed only ever fills empty tabs. Clear both tabs by hand (keep the header row) if you meant to start over.',
    'To add rows the sheet is missing without touching what is already there, run seed again with --append.',
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')
}

// ---------------------------------------------------------------------------
// seed --append (issue #83)
// ---------------------------------------------------------------------------

/** Reads `id` off each raw bootstrap row as a string, skipping rows with no id (or a non-string one). */
function idsFromBootstrapRows(rows: unknown[] | undefined): Set<string> {
  const ids = new Set<string>()
  for (const row of rows ?? []) {
    if (row === null || typeof row !== 'object') continue
    const id = (row as { id?: unknown }).id
    if (typeof id === 'string' && id.length > 0) ids.add(id)
  }
  return ids
}

/**
 * The seed tasks and rewards whose id is not already in the sheet
 * (`bootstrapResponse`'s raw `tasks`/`rewards` rows), in seed order -- so a
 * group parent still precedes its own sub-items. Existing rows are never
 * touched, and a sheet row whose id is not part of the seed catalog at all
 * is simply ignored.
 */
export function missingSeedRows(
  bootstrapResponse: { tasks?: unknown[]; rewards?: unknown[] },
  payload: SeedPayload,
): SeedPayload {
  const existingTaskIds = idsFromBootstrapRows(bootstrapResponse.tasks)
  const existingRewardIds = idsFromBootstrapRows(bootstrapResponse.rewards)
  return {
    tasks: payload.tasks.filter((task) => !existingTaskIds.has(task.id)),
    rewards: payload.rewards.filter((reward) => !existingRewardIds.has(reward.id)),
  }
}

function formatMissingTaskLine(task: SeedPayload['tasks'][number]): string {
  return `+ ${task.name} (${task.category}, ${task.points} pts)`
}

function formatMissingRewardLine(reward: SeedPayload['rewards'][number]): string {
  return `+ ${reward.name} (${reward.cost} pts)`
}

/** What --append (with or without --dry-run) prints to describe the rows it would insert: tasks grouped by category, then rewards, then the counts. */
export function formatAppendDryRun(missing: SeedPayload): string {
  const lines: string[] = []
  const categories: string[] = []
  for (const task of missing.tasks) {
    if (!categories.includes(task.category)) categories.push(task.category)
  }
  for (const category of categories) {
    lines.push(`${category}:`)
    for (const task of missing.tasks.filter((t) => t.category === category)) {
      lines.push(`  ${formatMissingTaskLine(task)}`)
    }
  }
  if (missing.rewards.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('rewards:')
    for (const reward of missing.rewards) {
      lines.push(`  ${formatMissingRewardLine(reward)}`)
    }
  }
  lines.push('')
  lines.push(`${missing.tasks.length} missing tasks, ${missing.rewards.length} missing rewards`)
  return lines.join('\n')
}

/**
 * The whole `seed --append` flow, with the network call and the
 * confirmation prompt injected so tests/scripts/household.test.ts can drive
 * it against a fake instead of a live script: posts `bootstrap`, works out
 * `missingSeedRows`, then (unless --dry-run, or nothing is missing) confirms
 * and posts one tasks.upsert/rewards.upsert per missing row in order,
 * stopping at the first failure.
 */
export async function runSeedAppend(
  url: string,
  secret: string,
  payload: SeedPayload,
  opts: { dryRun: boolean; yes: boolean },
  deps: {
    post: (url: string, secret: string, action: string, params?: object) => Promise<ActionResponse>
    confirm: (question: string) => Promise<boolean>
    log?: (line: string) => void
    error?: (line: string) => void
  },
): Promise<number> {
  const log = deps.log ?? console.log
  const error = deps.error ?? console.error

  const bootstrapResponse = await deps.post(url, secret, 'bootstrap')
  if (bootstrapResponse.ok === false) {
    error(`bootstrap failed: ${bootstrapResponse.code ?? 'unknown'} ${bootstrapResponse.message ?? ''}`.trim())
    return 1
  }

  const bootstrapTasks = Array.isArray(bootstrapResponse.tasks) ? bootstrapResponse.tasks : []
  const bootstrapRewards = Array.isArray(bootstrapResponse.rewards) ? bootstrapResponse.rewards : []
  const missing = missingSeedRows({ tasks: bootstrapTasks, rewards: bootstrapRewards }, payload)

  if (opts.dryRun) {
    log(formatAppendDryRun(missing))
    return 0
  }

  if (missing.tasks.length === 0 && missing.rewards.length === 0) {
    log('Nothing to add: the sheet already has every seed row.')
    return 0
  }

  if (!opts.yes) {
    const proceed = await deps.confirm(
      `This inserts ${missing.tasks.length} missing tasks and ${missing.rewards.length} missing rewards into ${url}. Continue? [y/N] `,
    )
    if (!proceed) {
      log('Aborted, nothing sent.')
      return 1
    }
  }

  for (const task of missing.tasks) {
    const response = await deps.post(url, secret, 'tasks.upsert', { task })
    if (response.ok === false) {
      error(
        `Failed inserting ${task.name} (${task.id}): ${response.code ?? 'unknown'} ${response.message ?? ''}`.trim(),
      )
      return 1
    }
    log(formatMissingTaskLine(task))
  }
  for (const reward of missing.rewards) {
    const response = await deps.post(url, secret, 'rewards.upsert', { reward })
    if (response.ok === false) {
      error(
        `Failed inserting ${reward.name} (${reward.id}): ${response.code ?? 'unknown'} ${response.message ?? ''}`.trim(),
      )
      return 1
    }
    log(formatMissingRewardLine(reward))
  }

  log(`Inserted ${missing.tasks.length} tasks and ${missing.rewards.length} rewards.`)
  return 0
}

// ---------------------------------------------------------------------------
// The one network call every subcommand goes through
// ---------------------------------------------------------------------------

export interface ActionResponse {
  ok: boolean
  code?: string
  message?: string
  [key: string]: unknown
}

/** POSTs `{ secret, action, ...params }` as text/plain JSON (Architecture §5) and follows Apps Script's redirect. */
export async function postAction(
  url: string,
  secret: string,
  action: string,
  params: object = {},
): Promise<ActionResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ secret, action, ...params }),
    redirect: 'follow',
  })
  const text = await res.text()
  try {
    return JSON.parse(text) as ActionResponse
  } catch {
    throw new Error(`the script did not answer with JSON (HTTP ${res.status}): ${text.slice(0, 200)}`)
  }
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(question)
    return /^y(es)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

// ---------------------------------------------------------------------------
// Subcommands (IO)
// ---------------------------------------------------------------------------

function cmdSecret(): number {
  const secret = generateSecret()
  console.log(secret)
  console.log('')
  console.log(formatSecretInstructions(secret))
  console.log('')
  console.log('This is the only place the secret is printed. It does not go in the repo, the sheet, or the built app.')
  return 0
}

async function cmdCheck(args: ParsedArgs): Promise<number> {
  const url = flagValue(args, 'url')
  if (!url) {
    console.error('check needs --url <scriptUrl>')
    return 1
  }
  let secret: string
  try {
    secret = resolveSecret(flagValue(args, 'secret'))
  } catch (err) {
    console.error((err as Error).message)
    return 1
  }

  const rightSecretResponse = await postAction(url, secret, 'version')
  const wrongSecretResponse = await postAction(url, `wrong-${secret}`, 'version')
  const summary = evaluateCheckResults(rightSecretResponse, wrongSecretResponse)
  for (const outcome of summary.outcomes) {
    console.log(`${outcome.ok ? 'PASS' : 'FAIL'} - ${outcome.name} (${outcome.detail})`)
  }
  console.log(summary.sheetLine)

  console.log('')
  console.log('Schedule columns (issue #67):')
  try {
    const bootstrapResponse = await postAction(url, secret, 'bootstrap')
    if (bootstrapResponse.ok === false) {
      console.log('  could not check: bootstrap answered ' + (bootstrapResponse.code ?? 'an error'))
    } else {
      const tasks = Array.isArray(bootstrapResponse.tasks) ? bootstrapResponse.tasks : []
      const events = Array.isArray(bootstrapResponse.events) ? bootstrapResponse.events : []
      console.log(formatScheduleColumnChecks(checkScheduleColumns({ tasks, events })))
    }
  } catch (err) {
    console.log(`  could not check: ${(err as Error).message}`)
  }

  return summary.allPass ? 0 : 1
}

async function cmdSeed(args: ParsedArgs): Promise<number> {
  const url = flagValue(args, 'url')
  if (!url) {
    console.error('seed needs --url <scriptUrl>')
    return 1
  }
  let secret: string
  try {
    secret = resolveSecret(flagValue(args, 'secret'))
  } catch (err) {
    console.error((err as Error).message)
    return 1
  }
  const by = flagValue(args, 'by') ?? 'setup'
  const dryRun = hasFlag(args, 'dry-run')
  const payload = buildSeedPayload(new Date(), by)

  if (hasFlag(args, 'append')) {
    return runSeedAppend(url, secret, payload, { dryRun, yes: hasFlag(args, 'yes') }, { post: postAction, confirm })
  }

  if (dryRun) {
    console.log(formatSeedDryRun(payload))
    return 0
  }

  if (!hasFlag(args, 'yes')) {
    const proceed = await confirm(
      `This posts ${payload.tasks.length} tasks and ${payload.rewards.length} rewards to ${url}. Continue? [y/N] `,
    )
    if (!proceed) {
      console.log('Aborted, nothing sent.')
      return 1
    }
  }

  const response = await postAction(url, secret, 'seed', payload)
  if (response.ok === false) {
    if (response.code === 'invalid') {
      console.error(describeSeedRefusal(response))
    } else {
      console.error(`seed failed: ${response.code ?? 'unknown'} ${response.message ?? ''}`.trim())
    }
    return 1
  }
  console.log(
    `Seeded ${response.tasks ?? payload.tasks.length} tasks and ${response.rewards ?? payload.rewards.length} rewards.`,
  )
  return 0
}

function cmdMembers(args: ParsedArgs): number {
  try {
    const adults = flagValues(args, 'adult').map((spec) => parseMemberSpec(spec, 'adult'))
    const kids = flagValues(args, 'kid').map((spec) => parseMemberSpec(spec, 'kid'))
    const members = [...adults, ...kids]
    if (members.length === 0) {
      console.error('members needs at least one --adult uid:Name:#hex or --kid uid:Name:#hex')
      return 1
    }
    console.log('There is no members action in the Apps Script API: the members tab is filled in by hand.')
    console.log('Paste these rows under the header row of the members tab:')
    console.log('')
    console.log(formatMembersTable(members))
    return 0
  } catch (err) {
    console.error((err as Error).message)
    return 1
  }
}

function cmdLink(args: ParsedArgs): number {
  const url = flagValue(args, 'url')
  if (!url) {
    console.error('link needs --url <scriptUrl>')
    return 1
  }
  let secret: string
  try {
    secret = resolveSecret(flagValue(args, 'secret'))
  } catch (err) {
    console.error((err as Error).message)
    return 1
  }
  const app = flagValue(args, 'app') ?? DEFAULT_APP

  let link: string
  try {
    link = buildSetupLinkUrl(url, secret, app)
  } catch (err) {
    console.error((err as Error).message)
    return 1
  }

  console.log(link)
  console.log('')
  console.log('Share it the way you would share a password: a direct message to your partner, not a group chat,')
  console.log('not anywhere that gets archived or forwarded. Opening it on their phone connects that phone to')
  console.log('your household; there is nothing else to configure. There is no QR code by design, so it is never')
  console.log('a photo someone else can screenshot from across the room.')
  return 0
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgv(process.argv.slice(2))
  switch (args.command) {
    case 'secret':
      process.exitCode = cmdSecret()
      return
    case 'check':
      process.exitCode = await cmdCheck(args)
      return
    case 'seed':
      process.exitCode = await cmdSeed(args)
      return
    case 'members':
      process.exitCode = cmdMembers(args)
      return
    case 'link':
      process.exitCode = cmdLink(args)
      return
    default:
      console.log(USAGE)
      process.exitCode = args.command ? 1 : 0
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined
if (import.meta.url === entryUrl) {
  main()
}
