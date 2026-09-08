<script setup lang="ts">
/**
 * Settings (issue #21, Plan §5.5, Architecture.md §6-7): everything that is
 * not daily. MVP subset only -- task/reward/target editing, export and reset
 * stay out of scope for this ticket.
 *
 * Design read: Android-native consumer utility for two tired parents, calm
 * and Material-3-flavored (DESIGN.md §1). Dials: DESIGN_VARIANCE 4,
 * MOTION_INTENSITY 3, VISUAL_DENSITY 5 -- a settings list, not a dashboard.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  PhArrowClockwise,
  PhArrowSquareOut,
  PhCopy,
  PhDesktop,
  PhGearSix,
  PhMoon,
  PhSignOut,
  PhSun,
  PhWarningCircle,
} from '@phosphor-icons/vue'
import type { Component } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import InstallCard from '@/components/InstallCard.vue'
import MemberAvatar from '@/components/MemberAvatar.vue'
import Toast from '@/components/Toast.vue'
import { usePwa } from '@/composables/usePwa'
import { useSetupLinkUrl } from '@/composables/useSetupLinkUrl'
import { useTheme } from '@/composables/useTheme'
import { useToast } from '@/composables/useToast'
import type { Theme } from '@/schemas'
import { useHouseholdStore } from '@/stores/household'
import { useSessionStore } from '@/stores/session'
import { useSyncStore } from '@/stores/sync'
import { version as appVersion } from '../../package.json'

const REPO_URL = 'https://github.com/roughee/instachores-app'

const router = useRouter()
const householdStore = useHouseholdStore()
const sessionStore = useSessionStore()
const syncStore = useSyncStore()
const { showInstallCard, install, dismissInstallCard } = usePwa()
const { prefs, setTheme } = useTheme()
const { toast, show, dismiss } = useToast()

onMounted(() => {
  void syncStore.refreshVersion()
})

// -- Household: setup link -----------------------------------------------

/** Rebuilt from the session's own `link` (issue #21): the setup link this
 * phone is connected with, not a freshly-generated one. */
const { url: setupLinkUrl, copy: copySetupLink } = useSetupLinkUrl(() => sessionStore.link)

async function onCopyLink(): Promise<void> {
  if (!setupLinkUrl.value) return
  await copySetupLink()
  show({ message: 'Setup link copied' })
}

function onToastAction(): void {
  toast.value?.action?.onAction()
  dismiss()
}

// -- Appearance ------------------------------------------------------------

const THEME_OPTIONS: { value: Theme; label: string; icon: Component }[] = [
  { value: 'system', label: 'System', icon: PhDesktop },
  { value: 'light', label: 'Light', icon: PhSun },
  { value: 'dark', label: 'Dark', icon: PhMoon },
]

// -- Sync panel --------------------------------------------------------------

function formatTime(at: Date | undefined): string {
  if (!at) return 'Never'
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

async function onSyncNow(): Promise<void> {
  await syncStore.syncNow()
}

// -- Disconnect --------------------------------------------------------------

const confirmName = ref('')
const disconnecting = ref(false)

const canDisconnect = computed<boolean>(() => {
  const name = householdStore.household?.name
  return Boolean(name) && confirmName.value.trim() === name
})

async function onDisconnect(): Promise<void> {
  if (!canDisconnect.value || disconnecting.value) return
  disconnecting.value = true
  try {
    sessionStore.disconnect()
    await router.push('/welcome')
  } finally {
    disconnecting.value = false
  }
}
</script>

<template>
  <div class="settings-screen">
    <InstallCard v-if="showInstallCard" @install="install" @dismiss="dismissInstallCard" />

    <template v-if="householdStore.household">
      <section class="settings-screen__section" aria-labelledby="settings-household-heading">
        <h2 id="settings-household-heading" class="settings-screen__section-title">Household</h2>
        <p class="settings-screen__household-name">{{ householdStore.household.name }}</p>

        <label class="settings-screen__field" for="settings-setup-link">
          <span class="settings-screen__field-label">Setup link</span>
          <span class="settings-screen__field-control">
            <input
              id="settings-setup-link"
              class="settings-screen__input"
              type="text"
              readonly
              data-test="setup-link"
              :value="setupLinkUrl"
            />
            <button
              type="button"
              class="settings-screen__icon-button"
              data-test="copy-link"
              aria-label="Copy setup link"
              :disabled="!setupLinkUrl"
              @click="onCopyLink"
            >
              <PhCopy :size="20" weight="regular" aria-hidden="true" />
            </button>
          </span>
        </label>

        <ul class="settings-screen__members">
          <li v-for="member in householdStore.members" :key="member.uid" class="settings-screen__member">
            <MemberAvatar :name="member.name" :color="member.color" />
            <span class="settings-screen__member-name">{{ member.name }}</span>
          </li>
        </ul>
      </section>

      <section class="settings-screen__section" aria-labelledby="settings-appearance-heading">
        <h2 id="settings-appearance-heading" class="settings-screen__section-title">Appearance</h2>
        <div class="settings-screen__theme-options" role="group" aria-label="Appearance">
          <button
            v-for="option in THEME_OPTIONS"
            :key="option.value"
            type="button"
            class="settings-screen__theme-option"
            :class="{ 'settings-screen__theme-option--active': prefs.theme === option.value }"
            :aria-pressed="prefs.theme === option.value"
            :data-test="`theme-${option.value}`"
            @click="setTheme(option.value)"
          >
            <component :is="option.icon" :size="20" weight="regular" aria-hidden="true" />
            {{ option.label }}
          </button>
        </div>
      </section>

      <section class="settings-screen__section" aria-labelledby="settings-sync-heading">
        <h2 id="settings-sync-heading" class="settings-screen__section-title">Sync</h2>
        <dl class="settings-screen__stats">
          <div class="settings-screen__stat">
            <dt>Status</dt>
            <dd>{{ syncStore.online ? 'Online' : 'Offline' }}</dd>
          </div>
          <div class="settings-screen__stat">
            <dt>Outbox</dt>
            <dd>{{ syncStore.outboxCount }} waiting</dd>
          </div>
          <div class="settings-screen__stat">
            <dt>Last synced</dt>
            <dd>{{ formatTime(syncStore.lastPollAt) }}</dd>
          </div>
          <div class="settings-screen__stat">
            <dt>You are</dt>
            <dd>{{ householdStore.currentMember?.name ?? 'Unknown' }}</dd>
          </div>
          <div class="settings-screen__stat">
            <dt>Script</dt>
            <dd>{{ syncStore.scriptVersion ?? 'Not applicable' }}</dd>
          </div>
          <div class="settings-screen__stat">
            <dt>App build</dt>
            <dd>{{ appVersion }}</dd>
          </div>
          <div class="settings-screen__stat">
            <dt>Skipped rows</dt>
            <dd>{{ syncStore.skippedRows }}</dd>
          </div>
        </dl>

        <p v-if="syncStore.lastSkipped" class="settings-screen__skip-note" data-test="last-skipped">
          <PhWarningCircle :size="16" weight="regular" aria-hidden="true" />
          Last skipped row: {{ syncStore.lastSkipped.tab }} / {{ syncStore.lastSkipped.id }}
        </p>

        <button type="button" class="settings-screen__button" data-test="sync-now" @click="onSyncNow">
          <PhArrowClockwise :size="20" weight="regular" aria-hidden="true" />
          Sync now
        </button>
      </section>

      <section class="settings-screen__section" aria-labelledby="settings-disconnect-heading">
        <h2 id="settings-disconnect-heading" class="settings-screen__section-title">Disconnect</h2>
        <p class="settings-screen__hint">Type "{{ householdStore.household.name }}" to disconnect this phone.</p>
        <label class="settings-screen__field" for="settings-disconnect-confirm">
          <span class="settings-screen__field-label">Household name</span>
          <span class="settings-screen__field-control">
            <input
              id="settings-disconnect-confirm"
              v-model="confirmName"
              class="settings-screen__input"
              type="text"
              autocomplete="off"
              data-test="disconnect-confirm-name"
            />
          </span>
        </label>
        <button
          type="button"
          class="settings-screen__button settings-screen__button--danger"
          data-test="disconnect-button"
          :disabled="!canDisconnect || disconnecting"
          @click="onDisconnect"
        >
          <PhSignOut :size="20" weight="regular" aria-hidden="true" />
          Disconnect this phone
        </button>
      </section>
    </template>

    <EmptyState v-else :icon="PhGearSix" label="Settings load once the household arrives." />

    <section class="settings-screen__section" aria-labelledby="settings-about-heading">
      <h2 id="settings-about-heading" class="settings-screen__section-title">About</h2>
      <p class="settings-screen__about-name">HomeCrew</p>
      <p class="settings-screen__about-version" data-test="app-version">Version {{ appVersion }}</p>
      <a
        class="settings-screen__about-link"
        data-test="repo-link"
        :href="REPO_URL"
        target="_blank"
        rel="noopener noreferrer"
      >
        <PhArrowSquareOut :size="16" weight="regular" aria-hidden="true" />
        View the source
      </a>
    </section>

    <Toast
      v-if="toast"
      :message="toast.message"
      :action-label="toast.action?.label"
      :expires-at="toast.expiresAt"
      @action="onToastAction"
      @expire="dismiss"
    />
  </div>
</template>

<style scoped>
.settings-screen {
  display: flex;
  flex-direction: column;
  gap: var(--gutter);
  padding: var(--gutter);
}

.settings-screen__section {
  display: flex;
  flex-direction: column;
  gap: var(--list-gap);
  padding: var(--card-pad);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.settings-screen__section-title {
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--fs-md);
  font-weight: 600;
}

.settings-screen__household-name {
  color: var(--text);
  font-size: var(--fs-lg);
  font-weight: 600;
}

.settings-screen__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-screen__field-label {
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.settings-screen__field-control {
  display: flex;
  min-height: var(--touch);
  align-items: center;
  gap: 8px;
  padding: 0 4px 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-button);
  background: var(--surface-2);
}

.settings-screen__input {
  min-width: 0;
  flex: 1;
  border: none;
  background: none;
  color: var(--text);
  font-size: var(--fs-sm);
}

.settings-screen__input:focus {
  outline: none;
}

.settings-screen__icon-button {
  display: inline-flex;
  width: var(--touch);
  height: var(--touch);
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-button);
  color: var(--primary);
}

.settings-screen__icon-button:disabled {
  color: var(--text-2);
}

.settings-screen__members {
  display: flex;
  flex-direction: column;
  gap: var(--list-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.settings-screen__member {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-screen__member-name {
  color: var(--text);
  font-size: var(--fs-md);
}

.settings-screen__theme-options {
  display: flex;
  gap: var(--list-gap);
}

.settings-screen__theme-option {
  display: flex;
  min-height: var(--touch);
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-button);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  transition:
    background-color var(--dur-press) ease-out,
    color var(--dur-press) ease-out;
}

.settings-screen__theme-option--active {
  background: var(--primary-soft);
  color: var(--primary);
}

.settings-screen__stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--list-gap);
  margin: 0;
}

.settings-screen__stat dt {
  color: var(--text-2);
  font-size: var(--fs-xs);
}

.settings-screen__stat dd {
  margin: 0;
  color: var(--text);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.settings-screen__skip-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--warn);
  font-size: var(--fs-sm);
}

.settings-screen__hint {
  margin: 0;
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.settings-screen__button {
  display: flex;
  min-height: var(--touch);
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: var(--radius-button);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-md);
  font-weight: 600;
  transition: transform var(--dur-press) ease-out;
}

.settings-screen__button:active {
  transform: scale(0.97);
}

.settings-screen__button--danger {
  background: var(--danger);
  color: var(--on-primary);
}

.settings-screen__button--danger:disabled {
  background: var(--surface-2);
  color: var(--text-2);
}

.settings-screen__about-name {
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--fs-md);
  font-weight: 600;
}

.settings-screen__about-version {
  margin: 0;
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.settings-screen__about-link {
  display: inline-flex;
  min-height: var(--touch);
  align-items: center;
  gap: 6px;
  color: var(--primary);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-decoration: none;
}
</style>
