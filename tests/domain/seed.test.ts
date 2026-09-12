/**
 * The seed catalog (`src/domain/seed.ts`, Plan §3): every row parses through
 * the real `Task`/`Reward` schemas already (`seedTasks`/`seedRewards` call
 * `Task.parse`/`Reward.parse`), so these tests check the catalog's own
 * content -- ids, points, frequency, parent links, combo bonuses and no
 * accidental duplicate names -- rather than re-proving the schema.
 */
import { describe, expect, it } from 'vitest'
import { SEED_IDS, seedTasks } from '@/domain/seed'

const NOW = new Date('2026-09-09T18:00:00.000Z')
const BY = 'ana'

function tasks() {
  return seedTasks(NOW, BY)
}

function byId(id: string) {
  const t = tasks().find((task) => task.id === id)
  if (!t) throw new Error(`seed: no task with id ${id}`)
  return t
}

describe('seed catalog: issue #63 rows', () => {
  it('adds Clean windows as a home-category group parent with a combo bonus and a 90-day interval', () => {
    const t = byId(SEED_IDS.cleanWindows)
    expect(t.name).toBe('Clean windows')
    expect(t.category).toBe('home')
    expect(t.points).toBe(0)
    expect(t.freq).toBe('quarterly')
    expect(t.comboBonus).toBe(2)
    expect(t.intervalDays).toBe(90)
    expect(t.parentId).toBeUndefined()
  })

  it('adds the three window sub-items as children of Clean windows, quarterly, with their own points', () => {
    const balcony = byId(SEED_IDS.windowsBalcony)
    const terrace = byId(SEED_IDS.windowsTerrace)
    const bedroom = byId(SEED_IDS.windowsBedroom)

    expect(balcony.name).toBe('Balcony windows')
    expect(balcony.points).toBe(3)
    expect(terrace.name).toBe('Terrace windows')
    expect(terrace.points).toBe(3)
    expect(bedroom.name).toBe('Bedroom windows')
    expect(bedroom.points).toBe(2)

    for (const child of [balcony, terrace, bedroom]) {
      expect(child.category).toBe('home')
      expect(child.freq).toBe('quarterly')
      expect(child.parentId).toBe(SEED_IDS.cleanWindows)
    }
  })

  it('adds Clean freezer to the kitchen catalog, quarterly, 5 points', () => {
    const t = byId(SEED_IDS.freezer)
    expect(t.name).toBe('Clean freezer (defrost + wipe)')
    expect(t.category).toBe('kitchen')
    expect(t.points).toBe(5)
    expect(t.freq).toBe('quarterly')
    expect(t.parentId).toBeUndefined()
  })

  it('adds Sort medicine cabinet to home, quarterly, 3 points', () => {
    const t = byId(SEED_IDS.medicineCabinet)
    expect(t.name).toBe('Sort medicine cabinet')
    expect(t.category).toBe('home')
    expect(t.points).toBe(3)
    expect(t.freq).toBe('quarterly')
  })

  it('adds Sort TV table and Sort computer table to home, monthly, 2 points each', () => {
    const tvTable = byId(SEED_IDS.tvTable)
    const computerTable = byId(SEED_IDS.computerTableSort)

    expect(tvTable.name).toBe('Sort TV table')
    expect(tvTable.category).toBe('home')
    expect(tvTable.points).toBe(2)
    expect(tvTable.freq).toBe('monthly')

    expect(computerTable.name).toBe('Sort computer table')
    expect(computerTable.category).toBe('home')
    expect(computerTable.points).toBe(2)
    expect(computerTable.freq).toBe('monthly')
    // Distinct from the existing floors "Clean computer table" task.
    expect(computerTable.id).not.toBe('task-floors-computer-table')
  })

  it("adds Sort kids' books to kids, monthly, 2 points", () => {
    const t = byId(SEED_IDS.kidsBooks)
    expect(t.name).toBe("Sort kids' books")
    expect(t.category).toBe('kids')
    expect(t.points).toBe(2)
    expect(t.freq).toBe('monthly')
  })

  it('adds the three car tasks to the new car category, monthly', () => {
    const wash = byId(SEED_IDS.carWash)
    const carpets = byId(SEED_IDS.carCarpets)
    const trunk = byId(SEED_IDS.carTrunk)

    expect(wash.name).toBe('Car wash')
    expect(wash.category).toBe('car')
    expect(wash.points).toBe(5)
    expect(wash.freq).toBe('monthly')

    expect(carpets.name).toBe('Car carpets (vacuum + wash)')
    expect(carpets.category).toBe('car')
    expect(carpets.points).toBe(4)
    expect(carpets.freq).toBe('monthly')

    expect(trunk.name).toBe('Car trunk cleanout')
    expect(trunk.category).toBe('car')
    expect(trunk.points).toBe(3)
    expect(trunk.freq).toBe('monthly')
  })

  it('adds exactly twelve new rows, none duplicating an existing task name', () => {
    const newIds = [
      SEED_IDS.cleanWindows,
      SEED_IDS.windowsBalcony,
      SEED_IDS.windowsTerrace,
      SEED_IDS.windowsBedroom,
      SEED_IDS.freezer,
      SEED_IDS.medicineCabinet,
      SEED_IDS.tvTable,
      SEED_IDS.computerTableSort,
      SEED_IDS.kidsBooks,
      SEED_IDS.carWash,
      SEED_IDS.carCarpets,
      SEED_IDS.carTrunk,
    ]
    expect(newIds).toHaveLength(12)
    expect(new Set(newIds).size).toBe(12)

    const all = tasks()
    const names = all.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)

    // The catalog already had a stove, a bathroom mirror row, a fridge
    // cleanout and a "Clean computer table" wipe -- none of the new rows may
    // collide with those.
    expect(names).toContain('Clean stove / hob')
    expect(names).toContain('Sink + mirror + counter')
    expect(names).toContain('Fridge cleanout + wipe')
    expect(names).toContain('Clean computer table')
  })

  it('every new id actually resolves to a seeded task', () => {
    const ids = new Set(tasks().map((t) => t.id))
    for (const id of [
      SEED_IDS.cleanWindows,
      SEED_IDS.windowsBalcony,
      SEED_IDS.windowsTerrace,
      SEED_IDS.windowsBedroom,
      SEED_IDS.freezer,
      SEED_IDS.medicineCabinet,
      SEED_IDS.tvTable,
      SEED_IDS.computerTableSort,
      SEED_IDS.kidsBooks,
      SEED_IDS.carWash,
      SEED_IDS.carCarpets,
      SEED_IDS.carTrunk,
    ]) {
      expect(ids.has(id)).toBe(true)
    }
  })
})

describe('seed catalog: issue #81 rows', () => {
  it('adds Make breakfast and Make lunch to the kitchen catalog, daily', () => {
    const breakfast = byId(SEED_IDS.makeBreakfast)
    const lunch = byId(SEED_IDS.makeLunch)

    expect(breakfast.name).toBe('Make breakfast')
    expect(breakfast.category).toBe('kitchen')
    expect(breakfast.points).toBe(3)
    expect(breakfast.freq).toBe('daily')

    expect(lunch.name).toBe('Make lunch')
    expect(lunch.category).toBe('kitchen')
    expect(lunch.points).toBe(4)
    expect(lunch.freq).toBe('daily')
  })

  it('adds Make baby food to kids, weekly, with a 4-day interval', () => {
    const t = byId(SEED_IDS.babyFood)
    expect(t.name).toBe('Make baby food')
    expect(t.category).toBe('kids')
    expect(t.points).toBe(4)
    expect(t.freq).toBe('weekly')
    expect(t.intervalDays).toBe(4)
    expect(t.parentId).toBeUndefined()
  })

  it('adds Wash baby food containers + gear to kids, daily', () => {
    const t = byId(SEED_IDS.babyFoodGear)
    expect(t.name).toBe('Wash baby food containers + gear')
    expect(t.category).toBe('kids')
    expect(t.points).toBe(2)
    expect(t.freq).toBe('daily')
  })

  it('adds exactly four new rows, none duplicating an existing task name', () => {
    const newIds = [SEED_IDS.makeBreakfast, SEED_IDS.makeLunch, SEED_IDS.babyFood, SEED_IDS.babyFoodGear]
    expect(newIds).toHaveLength(4)
    expect(new Set(newIds).size).toBe(4)

    const all = tasks()
    const names = all.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)

    // Distinct from the existing baby-adjacent rows already in the catalog.
    expect(names).toContain('Wash baby bottles / pump parts')
    expect(names).toContain('Bath the kids')
    expect(names).toContain('Night feed / wake-up')
  })

  it('every new id actually resolves to a seeded task', () => {
    const ids = new Set(tasks().map((t) => t.id))
    for (const id of [SEED_IDS.makeBreakfast, SEED_IDS.makeLunch, SEED_IDS.babyFood, SEED_IDS.babyFoodGear]) {
      expect(ids.has(id)).toBe(true)
    }
  })
})
