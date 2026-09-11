<script setup lang="ts">
/**
 * Celebration overlay (issue #53, DESIGN.md §4 motion, §8 pre-flight):
 * mounted once in `App.vue`, fixed and pointer-events-none, centered on
 * the screen (issue #59; it started out just above the toast). `useCelebration()` is the shared composable state
 * that `LogScreen` and `CategoryScreen` write to right next to their
 * existing `show()` toast call; this component only reads it, renders one
 * of ten Phosphor-icon moments for 2700ms, then removes it from the
 * DOM. It never blocks or delays the toast, the haptic tick, or Undo --
 * there is nothing here to await. Every moment ends with a short fade so
 * the removal at the end is never a hard cut.
 *
 * Every moment justified in one sentence:
 *   1. Smile pop (PhSmiley) - the plainest "nice one", no words needed.
 *   2. Wink (PhSmileyWink) - a quick, calm nod, still one shape.
 *   3. Sparkle burst (5x PhSparkle) - the one firework moment, without
 *      confetti particles or a hand-drawn shape (DESIGN.md §2, §8).
 *   4. Rocket + trail (PhRocketLaunch, 2x PhSparkle) - momentum for
 *      finishing a chore, not just marking it done.
 *   5. Tree grows (PhTree) - a household growing something, on brand with
 *      the Home category.
 *   6. Flower opens (PhFlower) - the same idea, a softer register.
 *   7. Cat stretch (PhCat) - playful and low-key, fits a tired-parent app.
 *   8. Dog wag (PhDog) - enthusiastic without being loud about it.
 *   9. Bird takeoff (PhBird) - lightness, an errand lifted off the list.
 *   10. Star catch (PhStar) - a small reward landing, echoes `--points`.
 * `prefers-reduced-motion`: the moment is skipped entirely rather than
 * fading over 200ms (DESIGN.md §7's two allowed options) -- `base.css`
 * already clamps every animation's duration under reduced motion, so a
 * second, competing duration here would just fight that belt-and-braces
 * rule instead of cooperating with it, and this is purely decorative
 * (issue #53: "not to inform"), so nothing is lost by skipping it.
 */
import type { Component } from 'vue'
import {
  PhBird,
  PhCat,
  PhDog,
  PhFlower,
  PhRocketLaunch,
  PhSmiley,
  PhSmileyWink,
  PhSparkle,
  PhStar,
  PhTree,
} from '@phosphor-icons/vue'
import { useCelebrationOverlay, type CelebrationId } from '@/composables/useCelebration'

const ICONS: Record<CelebrationId, Component[]> = {
  'smile-pop': [PhSmiley],
  wink: [PhSmileyWink],
  'sparkle-burst': [PhSparkle, PhSparkle, PhSparkle, PhSparkle, PhSparkle],
  rocket: [PhRocketLaunch, PhSparkle, PhSparkle],
  'tree-grow': [PhTree],
  'flower-open': [PhFlower],
  'cat-stretch': [PhCat],
  'dog-wag': [PhDog],
  'bird-takeoff': [PhBird],
  'star-catch': [PhStar],
}

/**
 * Deliberately larger than any UI icon (DESIGN.md §4: 24, 20 in chips): a
 * celebration is a moment on top of the screen, not a control in it, and
 * at 28px and then 56px it still read as modest on a phone (issue #57).
 * 96 fills the 112px stage with room for the overshoot; the sparkles and
 * the rocket trail stay smaller so the burst reads as several small
 * things, not one big one. Every offset in the keyframes is scaled with
 * the icon so the motion keeps its shape.
 */
function iconSize(id: CelebrationId, index: number): number {
  if (id === 'sparkle-burst') return 48
  if (id === 'rocket') return index === 0 ? 96 : 36
  return 96
}

const { celebration, reducedMotion } = useCelebrationOverlay()
</script>

<template>
  <div class="celebration" aria-hidden="true">
    <div
      v-if="celebration && !reducedMotion"
      class="celebration__stage"
      :class="`celebration__stage--${celebration.id}`"
      :style="{ color: celebration.color }"
      data-test="celebration"
    >
      <component
        :is="icon"
        v-for="(icon, i) in ICONS[celebration.id]"
        :key="i"
        :size="iconSize(celebration.id, i)"
        weight="regular"
        class="celebration__icon"
      />
    </div>
  </div>
</template>

<style scoped>
.celebration {
  position: fixed;
  inset: 0;
  z-index: 21;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.celebration__stage {
  position: relative;
  display: flex;
  width: 112px;
  height: 112px;
  align-items: center;
  justify-content: center;
}

.celebration__icon {
  position: absolute;
  opacity: 0;
}

/* 1. Smile pop: scales in with a wobble. */
.celebration__stage--smile-pop .celebration__icon {
  animation: celebration-smile-pop var(--dur-celebration) ease-out forwards;
}

@keyframes celebration-smile-pop {
  0% {
    opacity: 0;
    transform: scale(0.3) rotate(-8deg);
  }

  50% {
    opacity: 1;
    transform: scale(1.15) rotate(6deg);
  }

  75% {
    transform: scale(0.95) rotate(-3deg);
  }

  88% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }

  100% {
    opacity: 0;
    transform: scale(1) rotate(0deg);
  }
}

/* 2. Wink: slides up and tilts. */
.celebration__stage--wink .celebration__icon {
  animation: celebration-wink var(--dur-celebration) ease-out forwards;
}

@keyframes celebration-wink {
  0% {
    opacity: 0;
    transform: translateY(27px) rotate(0deg);
  }

  60% {
    opacity: 1;
    transform: translateY(-7px) rotate(-10deg);
  }

  88% {
    opacity: 1;
    transform: translateY(0) rotate(-6deg);
  }

  100% {
    opacity: 0;
    transform: translateY(0) rotate(-6deg);
  }
}

/* 5. Tree grows: scales up from the ground with a slight overshoot. */
.celebration__stage--tree-grow .celebration__icon {
  transform-origin: bottom center;
  animation: celebration-tree var(--dur-celebration) ease-out forwards;
}

@keyframes celebration-tree {
  0% {
    opacity: 0;
    transform: scaleY(0.2) translateY(21px);
  }

  70% {
    opacity: 1;
    transform: scaleY(1.1) translateY(-3px);
  }

  88% {
    opacity: 1;
    transform: scaleY(1) translateY(0);
  }

  100% {
    opacity: 0;
    transform: scaleY(1) translateY(0);
  }
}

/* 6. Flower opens: rotates a quarter turn while scaling in. */
.celebration__stage--flower-open .celebration__icon {
  animation: celebration-flower var(--dur-celebration) ease-out forwards;
}

@keyframes celebration-flower {
  0% {
    opacity: 0;
    transform: scale(0.3) rotate(0deg);
  }

  88% {
    opacity: 1;
    transform: scale(1) rotate(90deg);
  }

  100% {
    opacity: 0;
    transform: scale(1) rotate(90deg);
  }
}

/* 7. Cat stretch: slides in from the left and nods. */
.celebration__stage--cat-stretch .celebration__icon {
  animation: celebration-cat var(--dur-celebration) ease-out forwards;
}

@keyframes celebration-cat {
  0% {
    opacity: 0;
    transform: translateX(-41px) rotate(0deg);
  }

  60% {
    opacity: 1;
    transform: translateX(3px) rotate(-8deg);
  }

  88% {
    opacity: 1;
    transform: translateX(0) rotate(6deg);
  }

  100% {
    opacity: 0;
    transform: translateX(0) rotate(6deg);
  }
}

/* 8. Dog wag: bounces twice. */
.celebration__stage--dog-wag .celebration__icon {
  animation: celebration-dog var(--dur-celebration) ease-out forwards;
}

@keyframes celebration-dog {
  0% {
    opacity: 0;
    transform: translateY(10px);
  }

  15% {
    opacity: 1;
  }

  30% {
    transform: translateY(-17px);
  }

  50% {
    transform: translateY(0);
  }

  70% {
    transform: translateY(-17px);
  }

  90% {
    transform: translateY(0);
  }

  95% {
    opacity: 1;
    transform: translateY(0);
  }

  100% {
    opacity: 0;
    transform: translateY(0);
  }
}

/* 9. Bird takeoff: arcs up and to the right and fades. */
.celebration__stage--bird-takeoff .celebration__icon {
  animation: celebration-bird var(--dur-celebration) ease-out forwards;
}

@keyframes celebration-bird {
  0% {
    opacity: 0;
    transform: translate(0, 10px) rotate(0deg);
  }

  40% {
    opacity: 1;
    transform: translate(24px, -24px) rotate(10deg);
  }

  100% {
    opacity: 0;
    transform: translate(55px, -58px) rotate(16deg);
  }
}

/* 10. Star catch: drops in from above and lands with a bounce. */
.celebration__stage--star-catch .celebration__icon {
  animation: celebration-star var(--dur-celebration) ease-out forwards;
}

@keyframes celebration-star {
  0% {
    opacity: 0;
    transform: translateY(-48px) scale(0.7);
  }

  60% {
    opacity: 1;
    transform: translateY(7px) scale(1.05);
  }

  80% {
    transform: translateY(-7px) scale(0.98);
  }

  88% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  100% {
    opacity: 0;
    transform: translateY(0) scale(1);
  }
}

/* Sparkle burst (3) and rocket (4) come last: their icons use
   :nth-child() to differ per icon, and stylelint's no-descending-specificity
   wants that higher-specificity block after the plain per-moment ones. */

/* 3. Sparkle burst: five icons fly outward from one point and fade. */
.celebration__stage--sparkle-burst .celebration__icon {
  animation: celebration-sparkle var(--dur-celebration) ease-out forwards;
}

.celebration__stage--sparkle-burst .celebration__icon:nth-child(1) {
  --sparkle-x: 0px;
  --sparkle-y: -38px;
}

.celebration__stage--sparkle-burst .celebration__icon:nth-child(2) {
  --sparkle-x: 36px;
  --sparkle-y: -12px;
}

.celebration__stage--sparkle-burst .celebration__icon:nth-child(3) {
  --sparkle-x: 22px;
  --sparkle-y: 31px;
}

.celebration__stage--sparkle-burst .celebration__icon:nth-child(4) {
  --sparkle-x: -22px;
  --sparkle-y: 31px;
}

.celebration__stage--sparkle-burst .celebration__icon:nth-child(5) {
  --sparkle-x: -36px;
  --sparkle-y: -12px;
}

@keyframes celebration-sparkle {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.4);
  }

  35% {
    opacity: 1;
    transform: translate(var(--sparkle-x), var(--sparkle-y)) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate(calc(var(--sparkle-x) * 1.6), calc(var(--sparkle-y) * 1.6)) scale(0.8);
  }
}

/* 4. Rocket: rises off the top with a short trail of two sparkles. */
.celebration__stage--rocket .celebration__icon:nth-child(1) {
  animation: celebration-rocket var(--dur-celebration) ease-out forwards;
}

.celebration__stage--rocket .celebration__icon:nth-child(2) {
  --trail-x: -17px;

  animation: celebration-rocket-trail var(--dur-celebration) ease-out forwards;
}

.celebration__stage--rocket .celebration__icon:nth-child(3) {
  --trail-x: 17px;

  animation: celebration-rocket-trail var(--dur-celebration) ease-out forwards;
}

@keyframes celebration-rocket {
  0% {
    opacity: 0;
    transform: translateY(27px) rotate(-4deg);
  }

  40% {
    opacity: 1;
    transform: translateY(-10px) rotate(0deg);
  }

  100% {
    opacity: 0;
    transform: translateY(-96px) rotate(4deg);
  }
}

@keyframes celebration-rocket-trail {
  0% {
    opacity: 0;
    transform: translate(var(--trail-x), 34px) scale(0.6);
  }

  50% {
    opacity: 1;
    transform: translate(var(--trail-x), 3px) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate(var(--trail-x), -38px) scale(0.4);
  }
}
</style>
