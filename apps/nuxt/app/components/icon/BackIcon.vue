<script setup lang="ts">

import { BaseIcon } from '@typewords/base'
import { useAttrs } from "vue";
import { useNav } from "@typewords/core/utils";

const attrs = useAttrs()
const router = useNav()

function onClick() {
  if (!attrs.onClick) {
    router.back()
  }
}
</script>

<template>
  <BaseIcon
      :title="$t('back')"
      @click="onClick"
  >
    <IconFluentChevronLeft28Filled/>
  </BaseIcon>
</template>

<style scoped lang="scss">

</style>
