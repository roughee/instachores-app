<script setup lang="ts">
/**
 * Welcome / Connect (issue #16, Plan §5.5, Architecture.md §7): first run.
 * Paste or open a setup link, decode it locally, preview the household to
 * see its members, pick one, and connect. "Try the demo" skips all of that
 * for a seeded, no-network household. The router guard (src/router.ts)
 * keeps an already-connected phone from ever seeing this screen.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  PhHouseLine,
  PhLink,
  PhSignIn,
  PhSparkle,
  PhUserCircle,
  PhWarningCircle,
  PhWifiSlash,
} from '@phosphor-icons/vue'
import { hasFlag } from '@/composables/usePwa'
import { useOnline } from '@/composables/useOnline'
import { RepoError } from '@/data/repo'
import { decodeSetupLink, extractSetupLinkToken } from '@/schemas'
import type { Household as HouseholdT, Member as MemberT, SetupLink as SetupLinkT } from '@/schemas'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { online } = useOnline()

const initialToken = typeof route.query.s === 'string' ? route.query.s : ''
const linkInput = ref(initialToken)
// `forceLinkError` renders the error state on load with no interaction, for
// scripts/screenshots.mjs (issue #16, DESIGN.md §8: error state screenshotted
// in both themes) -- the same trick usePwa.ts uses for its own states.
const error = ref(hasFlag('forceLinkError') ? 'That link is not a HomeCrew setup link.' : '')
const connecting = ref(false)
const joining = ref(false)
const previewedHousehold = ref<HouseholdT | undefined>(undefined)
const pendingLink = ref<SetupLinkT | undefined>(undefined)

const members = computed<MemberT[]>(() =>
  previewedHousehold.value ? Object.values(previewedHousehold.value.members) : [],
)

async function onConnect(): Promise<void> {
  if (!online.value || connecting.value) return
  error.value = ''
  previewedHousehold.value = undefined
  pendingLink.value = undefined

  let link: SetupLinkT
  try {
    link = decodeSetupLink(extractSetupLinkToken(linkInput.value))
  } catch {
    error.value = 'That link is not a HomeCrew setup link.'
    return
  }

  connecting.value = true
  try {
    previewedHousehold.value = await session.preview(link)
    pendingLink.value = link
  } catch (e) {
    error.value =
      e instanceof RepoError && e.code === 'unauthorized'
        ? 'The household did not accept this link. Check the secret.'
        : 'Could not reach the household. Try again.'
  } finally {
    connecting.value = false
  }
}

async function onPickMember(uid: string): Promise<void> {
  if (!pendingLink.value || joining.value) return
  joining.value = true
  try {
    await session.connect(pendingLink.value, uid)
    await router.push('/log')
  } finally {
    joining.value = false
  }
}

async function onDemo(): Promise<void> {
  await session.startDemo()
  await router.push('/log')
}
</script>

<template>
  <div class="welcome">
    <header class="welcome__hero">
      <span class="welcome__logo">
        <PhHouseLine :size="32" weight="regular" aria-hidden="true" />
      </span>
      <h1 class="welcome__title">HomeCrew</h1>
      <p class="welcome__tagline">Make the daily grind count</p>
    </header>

    <section class="welcome__card" aria-labelledby="welcome-connect-heading">
      <h2 id="welcome-connect-heading" class="welcome__card-title">Connect your household</h2>

      <label class="welcome__field" for="welcome-link">
        <span class="welcome__field-label">Setup link</span>
        <span class="welcome__field-control">
          <PhLink :size="20" weight="regular" aria-hidden="true" />
          <input
            id="welcome-link"
            v-model="linkInput"
            class="welcome__input"
            type="text"
            inputmode="url"
            autocomplete="off"
            placeholder="Paste the setup link"
            data-test="link-input"
          />
        </span>
      </label>

      <p v-if="!online" class="welcome__offline" data-test="offline-notice">
        <PhWifiSlash :size="20" weight="regular" aria-hidden="true" />
        Connecting needs a network. Try the demo for now.
      </p>

      <p v-if="error" class="welcome__error" role="alert" data-test="link-error">
        <PhWarningCircle :size="20" weight="regular" aria-hidden="true" />
        {{ error }}
      </p>

      <button
        type="button"
        class="welcome__button welcome__button--primary"
        data-test="connect-button"
        :disabled="!online || connecting"
        @click="onConnect"
      >
        <PhSignIn :size="20" weight="regular" aria-hidden="true" />
        {{ connecting ? 'Connecting' : 'Connect' }}
      </button>

      <div v-if="members.length > 0" class="welcome__members" data-test="member-list">
        <h2 class="welcome__card-title">Who are you?</h2>
        <button
          v-for="member in members"
          :key="member.uid"
          type="button"
          class="welcome__member"
          :disabled="joining"
          data-test="member-button"
          @click="onPickMember(member.uid)"
        >
          <span class="welcome__member-dot" :style="{ backgroundColor: member.color }" aria-hidden="true"></span>
          <PhUserCircle :size="20" weight="regular" aria-hidden="true" />
          {{ member.name }}
        </button>
      </div>
    </section>

    <button type="button" class="welcome__demo" data-test="demo-button" @click="onDemo">
      <PhSparkle :size="20" weight="regular" aria-hidden="true" />
      Try the demo
    </button>
  </div>
</template>

<style scoped>
.welcome {
  display: flex;
  flex-direction: column;
  gap: calc(var(--gutter) * 1.5);
  min-height: 100%;
  padding: calc(var(--gutter) * 2) var(--gutter) var(--gutter);
}

.welcome__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.welcome__logo {
  display: inline-flex;
  width: var(--touch);
  height: var(--touch);
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-card);
  background: var(--primary-soft);
  color: var(--primary);
}

.welcome__title {
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  font-weight: 700;
}

.welcome__tagline {
  color: var(--text-2);
  font-size: var(--fs-md);
}

.welcome__card {
  display: flex;
  flex-direction: column;
  gap: var(--list-gap);
  padding: var(--card-pad);
  border-radius: var(--radius-card);
  background: var(--surface);
}

.welcome__card-title {
  font-family: var(--font-display);
  font-size: var(--fs-md);
  font-weight: 600;
}

.welcome__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.welcome__field-label {
  color: var(--text-2);
  font-size: var(--fs-sm);
}

.welcome__field-control {
  display: flex;
  min-height: var(--touch);
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-button);
  background: var(--surface-2);
  color: var(--text-2);
}

.welcome__input {
  min-width: 0;
  flex: 1;
  border: none;
  background: none;
  color: var(--text);
  font-size: var(--fs-md);
}

.welcome__input:focus {
  outline: none;
}

.welcome__offline,
.welcome__error {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-sm);
}

.welcome__offline {
  color: var(--warn);
}

.welcome__error {
  color: var(--danger);
}

.welcome__button {
  display: flex;
  min-height: var(--touch);
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: var(--radius-button);
  font-size: var(--fs-md);
  font-weight: 600;
  transition: transform var(--dur-press) ease-out;
}

.welcome__button:active {
  transform: scale(0.97);
}

.welcome__button--primary {
  background: var(--primary);
  color: var(--on-primary);
}

.welcome__button--primary:disabled {
  background: var(--surface-2);
  color: var(--text-2);
}

.welcome__members {
  display: flex;
  flex-direction: column;
  gap: var(--list-gap);
  padding-top: var(--list-gap);
  border-top: 1px solid var(--border);
}

.welcome__member {
  display: flex;
  min-height: var(--touch);
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-button);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-md);
  font-weight: 600;
  transition: transform var(--dur-press) ease-out;
}

.welcome__member:active {
  transform: scale(0.97);
}

.welcome__member-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-chip);
}

.welcome__demo {
  display: flex;
  min-height: var(--touch);
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: auto;
  border-radius: var(--radius-button);
  color: var(--primary);
  font-size: var(--fs-md);
  font-weight: 600;
}
</style>
