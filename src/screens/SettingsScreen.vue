<script setup lang="ts">
import { PhGearSix } from '@phosphor-icons/vue'
import EmptyState from '@/components/EmptyState.vue'
import InstallCard from '@/components/InstallCard.vue'
import { usePwa } from '@/composables/usePwa'

const { showInstallCard, install, dismissInstallCard } = usePwa()
</script>

<template>
  <div class="settings-screen">
    <InstallCard v-if="showInstallCard" @install="install" @dismiss="dismissInstallCard" />
    <EmptyState :icon="PhGearSix" label="Manage the household and appearance from here soon." />
  </div>
</template>

<style scoped>
.settings-screen {
  display: flex;
  flex-direction: column;
  gap: var(--list-gap);
  padding: var(--gutter);
}
</style>
