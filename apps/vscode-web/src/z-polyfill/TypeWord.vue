<script setup lang="ts">
import type { Word } from '@typewords/core/types/types.ts'
import VolumeIcon from '@typewords/core/components/icon/VolumeIcon.vue'
import { useSettingStore } from '@typewords/core/stores/setting.ts'
import { useBaseStore } from '@typewords/core/stores/base.ts'
import {
  usePlayBeep,
  usePlayCorrect,
  usePlayKeyboardAudio,
  usePlayWordAudio,
  useTTsPlayAudio,
} from '@typewords/core/hooks/sound.ts'
import { emitter, EventKey, useEvents } from '@typewords/core/utils/eventBus.ts'
import { onMounted, onUnmounted, watch } from 'vue'
import SentenceHightLightWord from '@typewords/core/components/word/SentenceHightLightWord.vue'
import { getDefaultWord } from '@typewords/core/types/func.ts'
import { _nextTick, last } from '@typewords/core/utils'
import { BaseButton, BaseIcon, Toast, ToastComponent, Tooltip } from '@typewords/base'
import Space from '@typewords/core/components/article/Space.vue'
import { ShortcutKey, WordPracticeType } from '@typewords/core/types/enum.ts'
import { useI18n } from 'vue-i18n'
import { useWordOptions } from '@typewords/core/hooks/dict.ts'
import HoverReveal from '@/z-polyfill/HoverReveal.vue'

const { t: $t } = useI18n()

interface IProps {
  word: Word
}

const props = withDefaults(defineProps<IProps>(), {
  word: () => getDefaultWord(),
})

const emit = defineEmits<{
  complete: []
  wrong: []
  know: []
  mastered: []
  skip: []
  toggleSimple: []
}>()

let input = $ref('')
let wrong = $ref('')
let showFullWord = $ref(false)
//错误次数
let wrongTimes = ref(0)
//输入锁定，因为跳转到下一个单词有延时，如果重复在延时期间内重复输入，导致会跳转N次
let inputLock = false
let wordRepeatCount = 0
// 记录单词完成的时间戳，用于防止同时按下最后一个字母和空格键时跳过单词
let wordCompletedTime = 0
let jumpTimer: ReturnType<typeof setTimeout> | null = null
let cursor = $ref({
  top: 0,
  left: 0,
})
const settingStore = useSettingStore()
const store = useBaseStore()

const playBeep = usePlayBeep()
const playCorrect = usePlayCorrect()
const playKeyboardAudio = usePlayKeyboardAudio()
const playWordAudio = usePlayWordAudio()
const ttsPlayAudio = useTTsPlayAudio()
const volumeIconRef: any = $ref()
const sentenceVolumeIconsRefs: any = $ref([])
const typingWordRef = $ref<HTMLDivElement>()
// const volumeTranslateIconRef: any = $ref()

let displayWord = $computed(() => {
  return props.word.word.slice(input.length + wrong.length)
})
let displaySentence = $computed(() => {
  return props.word.sentences[currentPracticeSentenceIndex].c.slice(input.length + wrong.length)
})

// 在全局对象中存储当前单词信息，以便其他模块可以访问
function updateCurrentWordInfo() {
  window.__CURRENT_WORD_INFO__ = {
    word: props.word.word,
    input: input,
    inputLock: inputLock,
    containsSpace: props.word.word.includes(' '),
  }
}

watch(() => props.word, reset, { deep: true })

function reset() {
  clearJumpTimer()
  wrong = input = ''
  wordRepeatCount = 0
  showWordResult.value = inputLock = false
  currentPracticeSentenceIndex = -1
  wordCompletedTime = 0 // 重置时间戳
  wrongTimes.value = 0
  if (settingStore.wordSound) {
    if (settingStore.wordPracticeType !== WordPracticeType.Dictation) {
      volumeIconRef?.play(400, true)
    }
  }
  // 更新当前单词信息
  updateCurrentWordInfo()
  checkCursorPosition()
}

// 监听输入变化，更新当前单词信息
watch(
  () => input,
  () => {
    updateCurrentWordInfo()
  }
)

onMounted(() => {
  // 初始化当前单词信息
  updateCurrentWordInfo()

  emitter.on(EventKey.resetWord, reset)
  emitter.on(EventKey.onTyping, onTyping)
})

onUnmounted(() => {
  clearJumpTimer()
  emitter.off(EventKey.resetWord, reset)
  emitter.off(EventKey.onTyping, onTyping)
})

function clearJumpTimer() {
  if (!jumpTimer) {
    return
  }
  clearTimeout(jumpTimer)
  jumpTimer = null
}

function repeat() {
  setTimeout(() => {
    wrong = input = ''
    wordRepeatCount++
    inputLock = false

    if (settingStore.wordSound) volumeIconRef?.play()
  }, settingStore.waitTimeForChangeWord)
}

let showWordResult = ref(false)
let pressNumber = 0

const right = $computed(() => {
  let target
  if (isTypingSentence()) {
    target = props.word.sentences[currentPracticeSentenceIndex].c
  } else {
    target = props.word.word
  }
  if (settingStore.ignoreCase) {
    return input.toLowerCase() === target.toLowerCase()
  } else {
    return input === target
  }
})

let showNotice = false

function know(e) {
  if (settingStore.wordPracticeType === WordPracticeType.Identify) {
    if (!showWordResult.value) {
      inputLock = showWordResult.value = true
      input = props.word.word
      emit('know')
      if (!showNotice) {
        Toast.info($t('know_word_tip'), { duration: 5000 })
        showNotice = true
      }
      return
    }
  }
  onTyping(e)
}

function mastered(e) {
  if (settingStore.wordPracticeType === WordPracticeType.Identify) {
    emit('mastered')
  }
}

function unknown(e) {
  if (settingStore.wordPracticeType === WordPracticeType.Identify) {
    if (!showWordResult.value) {
      showWordResult.value = true
      typo()
      if (settingStore.wordSound) volumeIconRef?.play()
      return
    }
  }
  onTyping(e)
}

let currentPracticeSentenceIndex = $ref(-1)

async function onTyping(e: KeyboardEvent) {
  // debugger
  let target
  let targetVolumeIcon
  if (isTypingSentence()) {
    target = props.word.sentences[currentPracticeSentenceIndex].c
    targetVolumeIcon = sentenceVolumeIconsRefs[currentPracticeSentenceIndex]
  } else {
    target = props.word.word
    targetVolumeIcon = volumeIconRef
  }
  // 输入完成会锁死不能再输入
  if (inputLock) {
    //判断是否是空格键以便切换到下一个
    if (e.code === 'Space') {
      //正确时就切换到下一个
      if (right) {
        clearJumpTimer()
        // 如果单词刚完成（300ms内），忽略空格键，避免同时按下最后一个字母和空格键时跳过
        if (wordCompletedTime && Date.now() - wordCompletedTime < 300) {
          return
        }
        completeTypeWord(false)
        showWordResult.value = inputLock = false
      } else {
        if (showWordResult.value) {
          // 错误时，提示用户按删除键，仅默写需要提示
          pressNumber++
          if (pressNumber >= 3) {
            Toast.info($t('press_delete_reinput'), { duration: 2000 })
            pressNumber = 0
          }
        }
      }
    } else {
      //当正确时，提醒用户按空格键切下一个
      if (right) {
        pressNumber++
        if (pressNumber >= 3) {
          Toast.info($t('press_space_continue'), { duration: 2000 })
          pressNumber = 0
        }
      } else {
        //当错误时，按任意键重新输入
        showWordResult.value = inputLock = false
        input = wrong = ''
        onTyping(e)
      }
    }
    return
  }
  inputLock = true
  let letter = e.key
  // console.log('letter',letter)
  //默写特殊逻辑
  if (settingStore.wordPracticeType === WordPracticeType.Dictation) {
    if (e.code === 'Space') {
      //如果输入长度大于单词长度/单词不包含空格，并且输入不为空（开始直接输入空格不行），则显示单词；
      // 这里inputLock 不设为 false，不能再输入了，只能删除（删除会重置 inputLock）或按空格切下一格
      if (input.length && (input.length >= target.length || !target.includes(' '))) {
        //比对是否一致
        if (input.toLowerCase() === target.toLowerCase()) {
          //如果已显示单词，则发射完成事件，并 return
          if (showWordResult.value) {
            return emit('complete')
          } else {
            //未显示单词，则播放正确音乐，并在后面设置为 showWordResult.value 为 true 来显示单词
            playCorrect()
            if (settingStore.wordSound) targetVolumeIcon?.play()
          }
        } else {
          //错误处理
          playBeep()
          if (settingStore.wordSound) targetVolumeIcon?.play()
          typo()
        }
        showWordResult.value = true
        return
      }
    }
    //默写途中不判断是否正确，在按空格再判断
    input += letter
    wrong = ''
    playKeyboardAudio()
    updateCurrentWordInfo()
    inputLock = false
  } else if (settingStore.wordPracticeType === WordPracticeType.Identify && !showWordResult.value) {
    //当自测模式下，按1和2会单独处理，如果按其他键则自动默认为不认识
    showWordResult.value = true
    typo()
    if (settingStore.wordSound) targetVolumeIcon?.play()
    inputLock = false
    onTyping(e)
  } else {
    let right = false
    if (settingStore.ignoreCase) {
      right = letter.toLowerCase() === target[input.length].toLowerCase()
    } else {
      right = letter === target[input.length]
    }
    //针对中文的特殊判断
    if (
      e.shiftKey &&
      (('！' === target[input.length] && e.code === 'Digit1') ||
        ('￥' === target[input.length] && e.code === 'Digit4') ||
        ('…' === target[input.length] && e.code === 'Digit6') ||
        ('（' === target[input.length] && e.code === 'Digit9') ||
        ('—' === target[input.length] && e.code === 'Minus') ||
        ('？' === target[input.length] && e.code === 'Slash') ||
        ('》' === target[input.length] && e.code === 'Period') ||
        ('《' === target[input.length] && e.code === 'Comma') ||
        ('“' === target[input.length] && e.code === 'Quote') ||
        ('：' === target[input.length] && e.code === 'Semicolon') ||
        ('）' === target[input.length] && e.code === 'Digit0'))
    ) {
      right = true
      letter = target[input.length]
    }
    if (
      !e.shiftKey &&
      (('【' === target[input.length] && e.code === 'BracketLeft') ||
        ('、' === target[input.length] && e.code === 'Slash') ||
        ('。' === target[input.length] && e.code === 'Period') ||
        ('，' === target[input.length] && e.code === 'Comma') ||
        ('‘' === target[input.length] && e.code === 'Quote') ||
        ('；' === target[input.length] && e.code === 'Semicolon') ||
        ('【' === target[input.length] && e.code === 'BracketLeft') ||
        ('】' === target[input.length] && e.code === 'BracketRight'))
    ) {
      right = true
      letter = target[input.length]
    }
    // console.log('e', e, e.code, e.shiftKey, word[input.length])

    if (right) {
      input += letter
      wrong = ''
      playKeyboardAudio()
    } else {
      typo()
      wrong = letter
      playBeep()
      if (settingStore.wordSound) targetVolumeIcon?.play()
      setTimeout(() => {
        if (settingStore.inputWrongClear && !isTypingSentence()) input = ''
        wrong = ''
      }, 500)
    }
    // 更新当前单词信息
    updateCurrentWordInfo()
    //不需要把inputLock设为false，输入完成不能再输入了，只能删除，删除会打开锁
    if (input.toLowerCase() === target.toLowerCase()) {
      wordCompletedTime = Date.now() // 记录单词完成的时间戳
      playCorrect()
      if (
        [WordPracticeType.Listen, WordPracticeType.Identify].includes(settingStore.wordPracticeType) &&
        !showWordResult.value
      ) {
        showWordResult.value = true
      }
      if ([WordPracticeType.FollowWrite, WordPracticeType.Spell].includes(settingStore.wordPracticeType)) {
        if (settingStore.autoNextWord) {
          completeTypeWord(true)
        }
      }
    } else {
      inputLock = false
    }
  }
}

function shouldRepeat() {
  if (settingStore.wordPracticeType === WordPracticeType.FollowWrite) {
    if (settingStore.repeatCount == 100) {
      return settingStore.repeatCustomCount > wordRepeatCount + 1
    } else {
      return settingStore.repeatCount > wordRepeatCount + 1
    }
  } else {
    return false
  }
}

function isTypingSentence() {
  return currentPracticeSentenceIndex !== -1
}

function completeTypeWord(delay: boolean) {
  if (settingStore.wordPracticeType === WordPracticeType.FollowWrite && settingStore.practiceSentence) {
    currentPracticeSentenceIndex++
    if (currentPracticeSentenceIndex < props.word.sentences.length) {
      // 还有下一个句子
      inputLock = false
      wrong = input = ''
      return
    }
  }
  if (shouldRepeat()) {
    repeat()
  } else {
    if (delay) {
      clearJumpTimer()
      jumpTimer = setTimeout(() => emit('complete'), settingStore.waitTimeForChangeWord)
    } else {
      emit('complete')
    }
  }
}

function del() {
  playKeyboardAudio()
  inputLock = false
  if (showWordResult.value) {
    input = ''
    showWordResult.value = false
  } else {
    if (wrong) {
      wrong = ''
    } else {
      input = input.slice(0, -1)
    }
  }
  // 更新当前单词信息
  updateCurrentWordInfo()
}

function showWord() {
  if (settingStore.allowWordTip) {
    //如果不是跟写模式，查看单词一律标记为错词
    if (settingStore.wordPracticeType !== WordPracticeType.FollowWrite || settingStore.dictation) {
      typo()
    }
    showFullWord = true
  }
}

function hideWord() {
  showFullWord = false
}

function typo() {
  emit('wrong')
  wrongTimes.value++
}

function play() {
  if (settingStore.wordPracticeType === WordPracticeType.Dictation || settingStore.dictation) {
    typo()
  }
  volumeIconRef?.play()
}

defineExpose({ del, showWord, hideWord, play, showWordResult, wrongTimes })

function mouseleave() {
  setTimeout(() => {
    showFullWord = false
  }, 50)
}

watch([() => input, () => showFullWord, () => settingStore.dictation], checkCursorPosition)

//检测光标位置
function checkCursorPosition() {
  _nextTick(() => {
    let cursorOffset
    if (isTypingSentence()) {
      cursorOffset = { top: 0, left: 0 }
    } else {
      cursorOffset = { top: 0, left: -3 }
    }
    // 选中目标元素
    const cursorEl = document.querySelector(`.cursor`)
    const inputList = document.querySelectorAll(`.l`)
    if (!typingWordRef || !cursorEl) return
    const typingWordRect = typingWordRef.getBoundingClientRect()

    if (inputList.length) {
      let inputRect = last(Array.from(inputList)).getBoundingClientRect()
      cursor = {
        top: inputRect.top + inputRect.height - cursorEl.clientHeight - typingWordRect.top + cursorOffset.top,
        left: inputRect.right - typingWordRect.left + cursorOffset.left,
      }
    } else {
      const dictation = document.querySelector(`.dictation`)
      let elRect
      if (dictation) {
        elRect = dictation.getBoundingClientRect()
      } else {
        const letter = document.querySelector(`.letter`)
        elRect = letter.getBoundingClientRect()
      }
      cursor = {
        top: elRect.top + elRect.height - cursorEl.clientHeight - typingWordRect.top + cursorOffset.top,
        left: elRect.left - typingWordRect.left + cursorOffset.left,
      }
    }
  })
}

useEvents([
  [ShortcutKey.KnowWord, know],
  [ShortcutKey.UnknownWord, unknown],
  [ShortcutKey.MasteredWord, mastered],
])

const notice = $computed(() => {
  let text =
    settingStore.wordPracticeType === WordPracticeType.Identify
      ? '选择后/输入后，按空格键切换下一个'
      : settingStore.wordPracticeType === WordPracticeType.Listen
        ? '输入完成后按空格键切换下一个'
        : showWordResult.value
          ? right
            ? '按空格键切换下一个'
            : $t('press_delete_reinput')
          : '按空格键完成输入'
  return {
    show: [WordPracticeType.Listen, WordPracticeType.Identify, WordPracticeType.Dictation].includes(
      settingStore.wordPracticeType
    ),
    text,
  }
})

const { isWordCollect, toggleWordCollect, isWordSimple, toggleWordSimple } = useWordOptions()

const isSimple = $computed(() => isWordSimple(props.word))
const isCollect = $computed(() => isWordCollect(props.word))
</script>

<template>
  <div class="typing-word" ref="typingWordRef" v-if="word.word.length">
    <div class="flex flex-col">
      <div class="flex gap-space items-center">
        <Tooltip
          :title="
            settingStore.dictation ? `可以按快捷键 ${settingStore.shortcutKeyMap[ShortcutKey.ShowWord]} 显示单词` : ''
          "
        >
          <div id="word" class="word" :class="wrong && 'is-wrong'" @mouseenter="showWord" @mouseleave="mouseleave">
            <div v-if="settingStore.wordPracticeType === WordPracticeType.Dictation">
              <div
                class="letter text-align-center w-full inline-block"
                v-opacity="!settingStore.dictation || showWordResult || showFullWord"
              >
                {{ word.word }}
              </div>
              <div class="mt-2 w-50 dictation" :class="showWordResult ? (right ? 'right' : 'wrong') : ''">
                <template v-for="i in input">
                  <span class="l" v-if="i !== ' '">{{ i }}</span>
                  <Space class="l" v-else :is-wrong="showWordResult ? !right : false" :is-wait="!showWordResult" />
                </template>
              </div>
            </div>
            <template v-else>
              <span class="input" v-if="input">{{ input }}</span>
              <span class="wrong" v-if="wrong">{{ wrong }}</span>
              <span class="letter" v-if="settingStore.dictation && !showFullWord">
                {{
                  displayWord
                    .split('')
                    .map(v => (v === ' ' ? '&nbsp;' : '_'))
                    .join('')
                }}
              </span>
              <span class="letter" v-else>{{ displayWord }}</span>
            </template>
          </div>
        </Tooltip>
        <HoverReveal class="flex gap-1">
          <div
            class="phonetic"
            :class="
              (settingStore.dictation ||
                [WordPracticeType.Spell, WordPracticeType.Listen, WordPracticeType.Dictation].includes(
                  settingStore.wordPracticeType
                )) &&
              !showFullWord &&
              !showWordResult &&
              'word-shadow'
            "
            v-if="settingStore.soundType === 'uk' && word.phonetic0"
          >
            | {{ word.phonetic0 }}
          </div>
          <div
            class="phonetic"
            :class="
              (settingStore.dictation ||
                [WordPracticeType.Spell, WordPracticeType.Listen, WordPracticeType.Dictation].includes(
                  settingStore.wordPracticeType
                )) &&
              !showFullWord &&
              !showWordResult &&
              'word-shadow'
            "
            v-if="settingStore.soundType === 'us' && word.phonetic1"
          >
            | {{ word.phonetic1 }}
          </div>
          <template v-slot:hover>
            <VolumeIcon
              :title="`发音(${settingStore.shortcutKeyMap[ShortcutKey.PlayWordPronunciation]})`"
              ref="volumeIconRef"
              :simple="true"
              :cb="() => playWordAudio(word.word)"
            />
          </template>
        </HoverReveal>
      </div>

      <div
        class="mt-4 flex gap-4"
        v-if="settingStore.wordPracticeType === WordPracticeType.Identify && !showWordResult"
      >
        <BaseButton
          :keyboard="`${$t('shortcut')}(${settingStore.shortcutKeyMap[ShortcutKey.KnowWord]})`"
          size="large"
          @click="know"
          >{{ $t('i_know') }}
        </BaseButton>
        <BaseButton
          :keyboard="`${$t('shortcut')}(${settingStore.shortcutKeyMap[ShortcutKey.UnknownWord]})`"
          size="large"
          @click="unknown"
          >{{ $t('i_dont_know') }}
        </BaseButton>
      </div>

      <div class="translate text-base" v-opacity="settingStore.translate || showWordResult || showFullWord">
        <div class="flex" v-for="v in word.trans">
          <span class="shrink-0 mr-1" :class="v.pos ? 'en-article-family' : ''">
            {{ v.pos }}
          </span>
          <span v-if="!settingStore.dictation || showWordResult || showFullWord">{{ v.cn }}</span>
          <SentenceHightLightWord v-else :text="v.cn" :word="word.word" :dictation="true" :high-light="false" />
        </div>
      </div>
    </div>

    <div
      class="other anim"
      v-opacity="
        ![WordPracticeType.Listen, WordPracticeType.Dictation, WordPracticeType.Identify].includes(
          settingStore.wordPracticeType
        ) ||
        showFullWord ||
        showWordResult
      "
    >
      <template v-if="word?.sentences?.length">
        <!--        <div class="line-white my-1"></div>-->
        <div class="flex flex-col gap-2 mt-2">
          <div class="sentence" v-for="item in word.sentences">
            <HoverReveal class="text-base flex gap-1">
              <SentenceHightLightWord
                :text="item.c"
                :word="word.word"
                :dictation="!(!settingStore.dictation || showFullWord || showWordResult)"
              />
              <template v-slot:hover>
                <VolumeIcon :title="`发音`" :simple="false" @click="ttsPlayAudio(item.c)" />
              </template>
            </HoverReveal>
            <div class="anim text-sm" v-opacity="settingStore.translate || showFullWord || showWordResult">
              {{ item.cn }}
            </div>
          </div>
        </div>
      </template>

      <template v-if="word?.phrases?.length">
        <div class="line-white my-1"></div>
        <div class="flex-wrap">
          <div class="flex items-center gap-2 mr-2" v-for="item in word.phrases">
            <SentenceHightLightWord
              class="shrink-0"
              :text="item.c"
              :word="word.word"
              :dictation="!(!settingStore.dictation || showFullWord || showWordResult)"
            />
            <span class="anim shrink-0 text-sm" v-opacity="settingStore.translate || showFullWord || showWordResult">
              {{ item.cn }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dictation {
  border-bottom: 1px solid gray;
}

.typing-word {
  width: 100%;
  flex: 1;
  word-break: break-word;
  position: relative;

  .phonetic,
  .translate {
    //font-size: 1.2rem;
  }

  .phonetic {
    color: var(--color-font-1);
    font-family: var(--word-font-family);
  }

  .word {
    .input,
    .right {
      color: rgb(22, 163, 74);
    }

    .wrong {
      color: rgba(red, 0.6);
    }

    &.is-wrong {
      animation: shake 0.82s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
    }
  }

  .cn {
    @apply text-base;
  }

  .en {
    @apply text-lg;
  }

  .pos {
    font-family: var(--en-article-family);
    @apply text-lg w-12;
  }
}

.line-white {
  border-bottom: 0.5px solid #433f3f;
}
</style>
