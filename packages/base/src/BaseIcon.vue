<script setup lang="ts">
import Tooltip from './Tooltip.vue'

defineProps<{
  title?: string
  disabled?: boolean
  noBg?: boolean
}>()

const emit = defineEmits(['click'])
</script>

<template>
  <Tooltip :title="title">
    <div v-bind="$attrs" @click="e => !disabled && emit('click', e)" class="icon-wrapper" :class="{ disabled, noBg }">
      <slot />
    </div>
  </Tooltip>
</template>

<style scoped lang="scss">
$w: 1.4rem;
.icon-wrapper {
  cursor: pointer;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.3rem;
  background: transparent;
  transition: all 0.3s;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;

  &:hover:not(.disabled, .noBg) {
    background: var(--color-fourth);
  }

  &:active:not(.disabled) {
    opacity: 0.7;
    transform: scale(0.9);
  }

  &.disabled {
    cursor: not-allowed;
    opacity: 0.3;
  }

  :deep(svg) {
    width: $w;
    height: $w;
  }
}

@media (max-width: 768px) {
  .icon-wrapper {
    min-width: 2.75rem;
    min-height: 2.75rem;
  }
}
</style>
