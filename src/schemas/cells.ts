/**
 * Cell coercions. Rows come back from the sheet as strings: numbers as text,
 * booleans as TRUE/FALSE, unused columns as "". These preprocessors make the
 * entity schemas accept both real values (from the app) and sheet cells.
 */
import { z } from 'zod'

const blank = (v: unknown): unknown => (v === '' || v === null ? undefined : v)

const numish = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const s = v.trim()
    return s === '' ? undefined : Number(s)
  }
  return blank(v)
}

const boolish = (v: unknown): unknown => {
  if (v === null) return undefined
  if (typeof v === 'string') {
    const s = v.trim().toUpperCase()
    if (s === 'TRUE') return true
    if (s === 'FALSE') return false
    if (s === '') return undefined
  }
  return v
}

/** Entity ids: uuids for most things, deterministic slugs for seeds and combo bonuses. */
export const Id = z.string().min(1).max(128)
export const OptId = z.preprocess(blank, Id.optional())
export const V1 = z.preprocess(numish, z.literal(1))
export const Int = <T extends z.ZodTypeAny>(inner: T) => z.preprocess(numish, inner)
export const Bool = <T extends z.ZodTypeAny>(inner: T) => z.preprocess(boolish, inner)
export const OptStr = <T extends z.ZodTypeAny>(inner: T) => z.preprocess(blank, inner)
export const DateT = z.coerce.date()
