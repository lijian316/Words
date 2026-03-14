<script setup lang="ts">
import { defineAsyncComponent, watch } from 'vue'
import { useSettingStore } from '~/stores/setting.ts'
import { useDisableEventListener } from '@typewords/core/hooks/event.ts'
import ConflictNoticeText from '~/components/dialog/ConflictNoticeText.vue'

const Dialog = defineAsyncComponent(() => import('~/components/dialog/Dialog.vue'))

let settingStore = useSettingStore()
const model = defineModel()

useDisableEventListener(() => model)
</script>

<template>
  <Dialog
    v-model="model"
    :title="$t('important_notice')"
    footer
    padding
    :cancel-button-text="$t('dont_remind')"
    :confirm-button-text="$t('close')"
    @cancel="settingStore.showConflictNotice2 = false"
  >
    <div class="w-150 center flex-col color-main">
      <ConflictNoticeText />
    </div>
  </Dialog>
</template>
