<script setup lang="ts">
import { BaseIcon, ToastComponent } from '@typewords/base'
import Logo from '@typewords/core/components/Logo.vue'
import MigrateDialog from '@typewords/core/components/dialog/MigrateDialog.vue'
import IeDialog from '@typewords/core/components/dialog/IeDialog.vue'
import { Origin } from '@typewords/core/config/env'
import useTheme from '@typewords/core/hooks/theme.ts'
import { useRuntimeStore } from '@typewords/core/stores/runtime.ts'
import { useSettingStore } from '@typewords/core/stores/setting.ts'
import { ShortcutKey } from '@typewords/core/types/enum.ts'
import { onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useInit } from '@typewords/core/composables/useInit.ts'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { toggleTheme, getTheme, setTheme } = useTheme()
const runtimeStore = useRuntimeStore()
const settingStore = useSettingStore()
let expand = $ref(false)
const init = useInit()

function toggleExpand(n: boolean) {
  expand = n
  document.documentElement.style.setProperty('--aside-width', n ? '12rem' : '4.5rem')
}

watch(() => settingStore.sideExpand, toggleExpand)

//迁移数据
let showTransfer = $ref(false)
onMounted(() => {
  init()

  if (new URLSearchParams(window.location.search).get('from_old_site') === '1' && location.origin === Origin) {
    if (localStorage.getItem('__migrated_from_2study_top__')) return
    setTimeout(() => {
      showTransfer = true
    }, 1000)
  }
})

watch(
  () => settingStore.load,
  n => {
    if (!n) return
    toggleExpand(settingStore.sideExpand)
    setTheme(settingStore.theme)
  }
)

watch(
  () => settingStore.theme,
  n => {
    setTheme(n)
  }
)

const { locales, setLocale } = useI18n()
const route = useRoute()

const showIcon = $computed(() => {
  return ['/words', '/articles', '/setting', '/help', '/doc', '/feedback'].includes(route.path)
})

// 移动端底部导航栏 - 在全屏练习页面隐藏
const showMobileBottomNav = $computed(() => {
  const hiddenPaths = ['/practice-words/', '/practice-articles/', '/words-test/']
  return !hiddenPaths.some(p => route.path.includes(p))
})
</script>

<template>
  <div class="layout anim">
    <!--    第一个aside 占位用-->
    <div class="aside space"></div>
    <div class="aside anim fixed">
      <div class="top" :class="!expand && 'hidden-span'">
        <Logo v-if="expand" />
        <NuxtLink to="/words" class="row">
          <IconFluentTextUnderlineDouble20Regular />
          <span>{{ $t('words') }}</span>
        </NuxtLink>
        <NuxtLink id="article" to="/articles" class="row">
          <IconFluentBookLetter20Regular />
          <span>{{ $t('articles') }}</span>
        </NuxtLink>
        <NuxtLink to="/setting" class="row">
          <IconFluentSettings20Regular />
          <span>{{ $t('setting') }}</span>
          <div
            class="red-point"
            :class="!settingStore.sideExpand && 'top-1 right-0'"
            v-if="runtimeStore.isNew || runtimeStore.isError"
          ></div>
        </NuxtLink>
        <NuxtLink to="/feedback" class="row">
          <IconFluentCommentEdit20Regular />
          <span>{{ $t('feedback') }}</span>
        </NuxtLink>
        <NuxtLink to="/doc" class="row">
          <IconFluentDocument20Regular />
          <span>{{ $t('document') }}</span>
        </NuxtLink>
        <NuxtLink to="/help" class="row">
          <IconFluentQuestionCircle20Regular />
          <span>{{ $t('help') }}</span>
        </NuxtLink>
        <!--        <div class="row" @click="router.push('/user')">-->
        <!--          <IconFluentPerson20Regular/>-->
        <!--          <span >用户</span>-->
        <!--        </div>-->
      </div>
      <div class="bottom flex justify-evenly">
        <BaseIcon @click="settingStore.sideExpand = !settingStore.sideExpand">
          <IconFluentChevronLeft20Filled v-if="expand" />
          <IconFluentChevronLeft20Filled class="transform-rotate-180" v-else />
        </BaseIcon>
      </div>
    </div>

    <!-- 移动端底部标签栏 -->
    <div class="mobile-bottom-nav" v-if="showMobileBottomNav">
      <div class="nav-item" @click="router.push('/')" :class="{ active: route.path === '/' }">
        <IconFluentHome20Regular />
        <span>主页</span>
      </div>
      <div class="nav-item" @click="router.push('/words')" :class="{ active: route.path?.startsWith('/words') || route.path?.startsWith('/dict') || route.path?.startsWith('/practice-words') || route.path?.startsWith('/words-test') }">
        <IconFluentTextUnderlineDouble20Regular />
        <span>单词</span>
      </div>
      <div class="nav-item" @click="router.push('/articles')" :class="{ active: route.path?.startsWith('/articles') || route.path?.startsWith('/book') || route.path?.startsWith('/practice-articles') }">
        <IconFluentBookLetter20Regular />
        <span>文章</span>
      </div>
      <div class="nav-item" @click="router.push('/setting')" :class="{ active: route.path === '/setting' }">
        <IconFluentSettings20Regular />
        <span>设置</span>
        <div class="red-dot" v-if="runtimeStore.isNew || runtimeStore.isError"></div>
      </div>
    </div>

    <MigrateDialog v-model="showTransfer" @ok="init" />

    <IeDialog />

    <div class="flex-1 z-1 relative main-content overflow-x-hidden" :class="{ 'has-bottom-nav': showMobileBottomNav }">
      <div class="mt-3 center relative z-9999" @click="router.push('/setting?index=6 ')" v-if="runtimeStore.isError">
        <ToastComponent type="error" :duration="0" :shadow="false" :showClose="false" message="同步失败" />
      </div>
      <!--      <slot></slot>-->
      <router-view></router-view>
      <div class="absolute right-4 top-4 flex z-1 gap-2" v-if="showIcon">
        <div class="relative group">
          <BaseIcon>
            <IconPhTranslate />
          </BaseIcon>
          <div
            class="space-y-2 pt-2 absolute z-2 right-0 opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 pointer-events-none group-hover:pointer-events-auto"
          >
            <div class="card mb-2 py-4 px-6 space-y-3">
              <div v-for="locale in locales" @click="setLocale(locale.code)" class="w-full cp break-keep black-link">
                {{ locale.name }}
              </div>
            </div>
          </div>
        </div>

        <BaseIcon
          :title="`${$t('toggle_theme')}(${settingStore.shortcutKeyMap[ShortcutKey.ToggleTheme]})`"
          @click="toggleTheme"
        >
          <IconFluentWeatherMoon16Regular v-if="getTheme() === 'light'" />
          <IconFluentWeatherSunny16Regular v-else />
        </BaseIcon>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.layout {
  width: 100%;
  height: 100%;
  display: flex;
  background: var(--color-primary);
}

.aside {
  background: var(--color-second);
  height: 100vh;
  padding: 1rem 1rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: rgb(0 0 0 / 3%) 0px 0px 12px 0px;
  width: var(--aside-width);
  z-index: 2;

  .hidden-span {
    span {
      display: none;
    }
  }
  .row {
    @apply cp rounded-md text p-2 my-2 flex items-center gap-2 relative shrink-0 hover:bg-fourth;
    transition: all 0.5s;
    color: var(--color-main-text);

    &.router-link-active {
      background: var(--color-fourth);
    }

    svg {
      @apply shrink-0 text-lg;
    }
  }
}

// 移动端底部标签栏
.mobile-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-second);
  border-top: 1px solid var(--color-item-border);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.08);
  z-index: 1000;
  display: flex;
  justify-content: space-around;
  align-items: stretch;
  padding-bottom: env(safe-area-inset-bottom, 0px);

  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 0.25rem;
    cursor: pointer;
    min-height: 50px;
    position: relative;
    transition: background 0.15s;
    -webkit-tap-highlight-color: transparent;

    svg {
      font-size: 1.4rem;
      color: var(--color-main-text);
      transition: color 0.15s, transform 0.15s;
    }

    span {
      font-size: 0.65rem;
      color: var(--color-main-text);
      margin-top: 0.2rem;
      transition: color 0.15s;
    }

    &.active {
      svg, span {
        color: var(--color-select-bg);
      }
      svg {
        transform: scale(1.1);
      }
    }

    &:active {
      background: var(--color-fourth);
    }

    .red-dot {
      position: absolute;
      top: 0.4rem;
      right: calc(50% - 1rem);
      width: 0.45rem;
      height: 0.45rem;
      background: #ff4444;
      border-radius: 50%;
    }
  }
}

// 移动端主内容区域底部内边距（有底部导航时）
.main-content.has-bottom-nav {
  @media (max-width: 768px) {
    padding-bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px));
  }
}

// 移动端隐藏左侧菜单栏
@media (max-width: 768px) {
  .aside {
    display: none;
  }

  .aside.space {
    display: none;
  }

  .main-content {
    width: 100%;
    margin-left: 0;
  }
}

// 桌面端隐藏移动端底部标签栏
@media (min-width: 769px) {
  .mobile-bottom-nav {
    display: none !important;
  }
}
</style>
