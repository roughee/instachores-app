/**
 * Deterministic id for a combo bonus: two phones detecting the same combo on
 * the same day produce the same id, so the second append is a no-op.
 */
export function comboBonusId(comboKey: string, day: string, householdId: string): string {
  return `combo-${comboKey}-${day}-${householdId}`
}
