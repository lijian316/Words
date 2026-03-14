<script setup lang="ts">
import { SoundFileOptions } from '@typewords/core/config/env.ts'
import { getAudioFileUrl, usePlayAudio } from '@typewords/core/hooks/sound.ts'
import Select from '@/components/base/select/Select.vue'
import Option from '@/components/base/select/Option.vue'
import VolumeIcon from '@/components/icon/VolumeIcon.vue'
import { Slider, Switch, Textarea } from '@typewords/base'
import SettingItem from '@/components/setting/SettingItem.vue'
import { useSettingStore } from '@/stores/setting.ts'
import { useBaseStore } from '@/stores/base.ts'
import { ShortcutKey } from '@typewords/core/types/enum.ts'

const settingStore = useSettingStore()
const store = useBaseStore()

const simpleWords = $computed({
  get: () => store.simpleWords.join(','),
  set: v => {
    try {
      store.simpleWords = v.split(',')
    } catch (e) {}
  },
})
</script>

<template>
  <div>
    <SettingItem :title="$t('ignore_case')" desc="开启后，输入时不区分大小写，如输入“hello”和“Hello”都会被认为是正确的">
      <Switch v-model="settingStore.ignoreCase" />
    </SettingItem>

    <SettingItem
      :title="$t('allow_dictation_tip')"
      :desc="`${$t('allow_dictation_tip_desc')} ${settingStore.shortcutKeyMap[ShortcutKey.ShowWord]}`"
    >
      <Switch v-model="settingStore.allowWordTip" />
    </SettingItem>

    <div class="line"></div>
    <SettingItem :title="$t('simple_word_filter')" :desc="$t('simple_word_filter_desc')">
      <Switch v-model="settingStore.ignoreSimpleWord" />
    </SettingItem>

    <SettingItem :title="$t('simple_word_list')" class="items-start!" v-if="settingStore.ignoreSimpleWord">
      <Textarea
        :placeholder="$t('words_comma_separated')"
        v-model="simpleWords"
        :autosize="{ minRows: 6, maxRows: 10 }"
      />
    </SettingItem>

    <!--          音效-->
    <!--          音效-->
    <!--          音效-->
    <div class="line"></div>
    <SettingItem :main-title="$t('sound_effect')" />
    <SettingItem :title="$t('pronunciation_accent')" :desc="$t('pronunciation_accent_desc')">
      <Select v-model="settingStore.soundType" :placeholder="$t('please_select')" class="w-50!">
        <Option :label="$t('us_accent')" value="us" />
        <Option :label="$t('uk_accent')" value="uk" />
      </Select>
    </SettingItem>

    <div class="line"></div>
    <SettingItem :title="$t('keyboard_sound')">
      <Switch v-model="settingStore.keyboardSound" />
    </SettingItem>
    <SettingItem :title="$t('keyboard_sound_effect')">
      <Select v-model="settingStore.keyboardSoundFile" :placeholder="$t('please_select')" class="w-50!">
        <Option v-for="item in SoundFileOptions" :key="item.value" :label="item.label" :value="item.value">
          <div class="flex justify-between items-center w-full">
            <span>{{ item.label }}</span>
            <VolumeIcon :time="100" @click="usePlayAudio(getAudioFileUrl(item.value)[0])" />
          </div>
        </Option>
      </Select>
    </SettingItem>
    <SettingItem :title="$t('volume')">
      <Slider v-model="settingStore.keyboardSoundVolume" showText showValue unit="%" />
    </SettingItem>
  </div>
</template>

<style scoped lang="scss"></style>
