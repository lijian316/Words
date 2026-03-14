<script setup lang="ts">
import { useSettingStore } from '@/stores/setting.ts'
import { useRouter } from 'vue-router'
import { IS_DEV } from '@typewords/core/config/env'

const settingStore = useSettingStore()
const router = useRouter()

function goHome() {
  if (IS_DEV) {
    router.push('/')
  } else {
    location.href = window.atob('aHR0cHM6Ly90eXBld29yZHMuY2M=')
  }
}
</script>

<template>
  <div class="center mb-2" @click="goHome">
    <img v-show="settingStore.theme === 'dark'" src="/imgs/logo/logo-text-white.png" alt="" />
    <img v-show="settingStore.theme !== 'dark'" src="/imgs/logo/logo-text-black.png" alt="" />
  </div>
</template>

<style scoped lang="scss">
img {
  cursor: pointer;
  height: 2rem;
}
</style>
