<script setup lang="ts">
/**
 * "Next time?" bottom sheet (Plan §5.5, DESIGN.md §5, issue #69): shown
 * after a `complete` to ask when the task should come back. Chips
 * preselect the task's `suggestedIntervalDays()`; an adhoc task with no
 * interval opens with nothing selected and a disabled primary button.
 * "Pick a date" opens a native `<input type="date">` (via `showPicker`,
 * with a plain `click` fallback for browsers -- and test environments --
 * without it) and maps the chosen calendar day to whole days from the
 * completion's own local day (`dayKey`), minimum 1, same as a preset chip.
 *
 * Dismissal (Escape, a scrim tap, or a > 40px drag-down on the handle) and
 * the primary button both just emit; `useNextTimeSheet.close()` plus
 * `eventsStore.scheduleNext` are the caller's job (LogScreen/
 * CategoryScreen), same separation as `Toast.vue` leaving `show`/`dismiss`
 * to its owner.
 *
 * Focus moves into the dialog on mount and back to whatever had it before
 * on unmount (DESIGN.md §7); the `document.activeElement` read lives in
 * `useFocusReturn.ts` because eslint only allows that browser global
 * outside `.vue` files.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PhCalendarBlank, PhCheck } from '@phosphor-icons/vue'
import { dueDayFor, suggestedIntervalDays } from '@/domain/schedule'
import { DAY_MS, dayKey } from '@/domain/time'
import type { Task } from '@/schemas'
import { captureFocusedElement, returnFocusTo } from '@/composables/useFocusReturn'
import {
  onDateInputChange,
  openDatePicker as openNativeDatePicker,
  useDragToDismiss,
  useElementRef,
  useInputRef,
} from '@/composables/useNextTimeSheetDom'

const props = defineProps<{
  task: Task
  completeEventId: string
  points: number
  memberName: string
  lastDoneAt?: Date | undefined
  completedAt: Date
  tz: string
  categoryLabel: string
}>()

const emit = defineEmits<{ schedule: [days: number]; dismiss: [] }>()

const PRESETS = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '5 days', days: 5 },
  { label: '7 days', days: 7 },
] as const

const selectedDays = ref<number | undefined>(suggestedIntervalDays(props.task))

function isPresetDays(days: number | undefined): boolean {
  return PRESETS.some((p) => p.days === days)
}

const isCustomSelected = computed(() => selectedDays.value !== undefined && !isPresetDays(selectedDays.value))

function selectPreset(days: number): void {
  selectedDays.value = days
}

/** Whole calendar days between two 'YYYY-MM-DD' keys, no zone maths needed
 * (both are already local calendar days -- `shiftDay`'s own approach). */
function daysBetweenKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = toKey.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS)
}

const dateInput = useInputRef()

function openDatePicker(): void {
  openNativeDatePicker(dateInput.value)
}

const onPickDate = onDateInputChange((value) => {
  const fromKey = dayKey(props.completedAt, props.tz)
  selectedDays.value = Math.max(1, daysBetweenKeys(fromKey, value))
})

const dueAt = computed(() =>
  selectedDays.value !== undefined ? dueDayFor(props.completedAt, selectedDays.value, props.tz) : undefined,
)

function formatDueDay(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(d)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')}`
}

const dueDayLabel = computed(() => (dueAt.value ? formatDueDay(dueAt.value, props.tz) : undefined))

function pluralDays(n: number): string {
  return n === 1 ? '1 day ago' : `${n} days ago`
}

const subline = computed(() => {
  const base = `+${props.points} pts for ${props.memberName}.`
  if (props.lastDoneAt === undefined) return base
  const days = Math.max(0, daysBetweenKeys(dayKey(props.lastDoneAt, props.tz), dayKey(props.completedAt, props.tz)))
  return `${base} Last done ${pluralDays(days)}.`
})

const canSchedule = computed(() => selectedDays.value !== undefined)

/** `undefined` removes the attribute entirely when enabled: Vue only drops
 * a bound attribute for `null`/`undefined`, not for `false`, and
 * `aria-disabled` is not one of the handful of attributes Vue treats as a
 * true boolean (those go by DOM-property truthiness instead). */
const scheduleAriaDisabled = computed(() => (canSchedule.value ? undefined : true))

const scheduleLabel = computed(() => (dueDayLabel.value ? `Schedule for ${dueDayLabel.value}` : 'Schedule'))

function onSchedulePrimary(): void {
  if (!canSchedule.value || selectedDays.value === undefined) return
  emit('schedule', selectedDays.value)
}

function onDismiss(): void {
  emit('dismiss')
}

// Drag-down on the handle (a simple pointer swipe of more than 40px):
// dismisses, same as Escape or a scrim tap.
const {
  onPointerDown: onHandlePointerDown,
  onPointerMove: onHandlePointerMove,
  onPointerUp: onHandlePointerUp,
} = useDragToDismiss(onDismiss)

const dialogRef = useElementRef()
let previouslyFocused: ReturnType<typeof captureFocusedElement> = null

onMounted(() => {
  previouslyFocused = captureFocusedElement()
  dialogRef.value?.focus()
})

onBeforeUnmount(() => {
  returnFocusTo(previouslyFocused)
})
</script>

<template>
  <div class="next-time-sheet-scrim" data-test="next-time-scrim" @click="onDismiss">
    <div
      ref="dialogRef"
      class="next-time-sheet"
      role="dialog"
      aria-label="Schedule next time"
      tabindex="-1"
      @click.stop
      @keydown.esc="onDismiss"
    >
      <div
        class="next-time-sheet__handle"
        @pointerdown="onHandlePointerDown"
        @pointermove="onHandlePointerMove"
        @pointerup="onHandlePointerUp"
        @pointercancel="onHandlePointerUp"
      />

      <div class="next-time-sheet__header">
        <span class="next-time-sheet__header-icon">
          <PhCheck :size="24" weight="regular" aria-hidden="true" />
        </span>
        <div class="next-time-sheet__header-text">
          <p class="next-time-sheet__title">{{ task.name }} logged</p>
          <p class="next-time-sheet__subline">{{ subline }}</p>
        </div>
      </div>

      <p class="next-time-sheet__prompt">When should it come back?</p>

      <div class="next-time-sheet__chips">
        <button
          v-for="preset in PRESETS"
          :key="preset.days"
          type="button"
          class="next-time-sheet__chip"
          :class="{ 'next-time-sheet__chip--selected': selectedDays === preset.days }"
          data-test="next-time-chip"
          :aria-pressed="selectedDays === preset.days"
          @click="selectPreset(preset.days)"
        >
          {{ preset.label }}
        </button>
        <button
          type="button"
          class="next-time-sheet__chip"
          :class="{ 'next-time-sheet__chip--selected': isCustomSelected }"
          data-test="next-time-chip"
          :aria-pressed="isCustomSelected"
          @click="openDatePicker"
        >
          <PhCalendarBlank :size="20" weight="regular" aria-hidden="true" />
          Pick a date
        </button>
        <input
          ref="dateInput"
          type="date"
          class="next-time-sheet__date-input"
          aria-hidden="true"
          tabindex="-1"
          @change="onPickDate"
        />
      </div>

      <p v-if="dueDayLabel" class="next-time-sheet__hint">
        It leaves the {{ categoryLabel }} list until {{ dueDayLabel }} and shows up on Schedule.
      </p>

      <div class="next-time-sheet__actions">
        <button type="button" class="next-time-sheet__not-now" data-test="next-time-not-now" @click="onDismiss">
          Not now
        </button>
        <button
          type="button"
          class="next-time-sheet__schedule"
          data-test="next-time-schedule"
          :aria-disabled="scheduleAriaDisabled"
          @click="onSchedulePrimary"
        >
          {{ scheduleLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.next-time-sheet-scrim {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: color-mix(in oklab, var(--text) 40%, transparent);
}

.next-time-sheet {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px var(--gutter) calc(24px + var(--safe-bottom));
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  background: var(--surface);
  box-shadow: 0 -4px 24px color-mix(in oklab, var(--text) 20%, transparent);
  transform: translateY(0);
  transition: transform var(--dur-sheet) ease-out;
}

.next-time-sheet__handle {
  width: 36px;
  height: 4px;
  align-self: center;
  border-radius: var(--radius-chip);
  background: var(--border);
  touch-action: none;
}

.next-time-sheet__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.next-time-sheet__header-icon {
  display: inline-flex;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-button);
  background: var(--primary-soft);
  color: var(--primary);
}

.next-time-sheet__header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.next-time-sheet__title {
  margin: 0;
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  font-weight: 600;
}

.next-time-sheet__subline {
  margin: 0;
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.next-time-sheet__prompt {
  margin: 0;
  color: var(--text);
  font-size: var(--fs-md);
}

.next-time-sheet__chips {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.next-time-sheet__chip {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border: 2px solid transparent;
  border-radius: var(--radius-chip);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-sm);
  transition:
    background-color var(--dur-press) ease-out,
    border-color var(--dur-press) ease-out;
}

.next-time-sheet__chip--selected {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}

.next-time-sheet__date-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.next-time-sheet__hint {
  margin: 0;
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.next-time-sheet__actions {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 8px;
}

.next-time-sheet__not-now,
.next-time-sheet__schedule {
  min-height: 48px;
  border: none;
  border-radius: var(--radius-button);
  font-size: var(--fs-md);
  font-weight: 600;
}

.next-time-sheet__not-now {
  background: var(--surface-2);
  color: var(--text);
}

.next-time-sheet__schedule {
  background: var(--primary);
  color: var(--on-primary);
}

.next-time-sheet__schedule[aria-disabled='true'] {
  opacity: 0.5;
}
</style>
