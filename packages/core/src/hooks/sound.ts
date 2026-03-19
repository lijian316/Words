import { onMounted, watchEffect } from 'vue'
import { useSettingStore } from '../stores/setting'

import { ENV, PronunciationApi, SoundFileOptions } from '@typewords/core/config/env'

export function useSound(audioSrcList?: string[], audioFileLength?: number) {
  let audioList: HTMLAudioElement[] = $ref([])
  let audioLength = $ref(1)
  let index = $ref(0)

  onMounted(() => {
    if (audioSrcList) setAudio(audioSrcList, audioFileLength)
  })

  //这里同一个音频弄好几份是为了快速打字是，可同时发音
  function setAudio(audioSrcList2: string[], audioFileLength2?: number) {
    if (audioFileLength2) audioLength = audioFileLength2
    audioList = []
    for (let i = 0; i < audioLength; i++) {
      audioSrcList2.map(src => audioList.push(new Audio(src.startsWith('/') || src.startsWith('http') ? src : ENV.RESOURCE_URL + src)))
    }
    index = 0
  }

  function play(volume: number = 100) {
    index++
    if (audioList.length > 1 && audioList.length !== audioLength) {
      let htmlAudioElement = audioList[index % audioList.length]
      if (htmlAudioElement) {
        htmlAudioElement.volume = volume / 100
        htmlAudioElement.play()
      }
    } else {
      let htmlAudioElement1 = audioList[index % audioLength]
      if (htmlAudioElement1) {
        htmlAudioElement1.volume = volume / 100
        htmlAudioElement1.play()
      }
    }
  }

  return { play, setAudio }
}

export function usePlayKeyboardAudio() {
  const settingStore = useSettingStore()
  const { play, setAudio } = useSound()

  watchEffect(() => {
    if (!SoundFileOptions.find(v => v.label === settingStore.keyboardSoundFile)) {
      settingStore.keyboardSoundFile = '机械键盘2'
    }
    let urlList = getAudioFileUrl(settingStore.keyboardSoundFile)
    setAudio(urlList, urlList.length === 1 ? 4 : 1)
  })

  function playAudio() {
    if (settingStore.keyboardSound) {
      play(settingStore.keyboardSoundVolume)
    }
  }

  return playAudio
}

export function usePlayBeep() {
  const settingStore = useSettingStore()
  const { play } = useSound([`/sound/beep.wav`], 1)

  function playAudio() {
    if (settingStore.effectSound) {
      play(settingStore.effectSoundVolume)
    }
  }

  return playAudio
}

export function usePlayCorrect() {
  const settingStore = useSettingStore()
  const { play } = useSound([`/sound/correct.wav`], 1)

  function playAudio() {
    if (settingStore.effectSound) {
      play(settingStore.effectSoundVolume)
    }
  }

  return playAudio
}

export function usePlayWordAudio() {
  const settingStore = useSettingStore()
  let audio = $ref<HTMLAudioElement>(null)

  onMounted(() => {
    audio = new Audio()
  })

  function playAudio(word: string) {
    if (!word) return
    let url = `${PronunciationApi}${word}&type=2`
    if (settingStore.soundType === 'uk') {
      url = `${PronunciationApi}${word}&type=1`
    }
    audio.src = url
    audio.volume = settingStore.wordSoundVolume / 100
    audio.playbackRate = settingStore.wordSoundSpeed
    audio.play()
    audio.onerror = e => {
      const ttsPlay = useTTsPlayAudio()
      ttsPlay(word)
    }
  }

  return playAudio
}

export function useTTsPlayAudio() {
  const settingStore = useSettingStore()

  function play(text: string) {
    speechSynthesis.cancel() // 防止 Chrome 队列卡死
    let msg = new SpeechSynthesisUtterance(text)
    msg.rate = settingStore.wordSoundSpeed
    msg.volume = settingStore.wordSoundVolume / 100
    msg.pitch = 1
    msg.lang = 'en-US'
    let voiceList = speechSynthesis.getVoices().filter(v => v.lang === 'en-US')
    if (voiceList && voiceList.length) {
      msg.voice = voiceList.find(v => v.name.includes('Emma ')) || voiceList[0]
    }
    speechSynthesis.speak(msg)
  }

  return play
}

export function usePlayAudio(url: string) {
  new Audio(url).play().then(r => void 0)
}

export function getAudioFileUrl(name: string) {
  if (name === '机械键盘') {
    return [
      `/sound/key-sounds/jixie/机械0.mp3`,
      `/sound/key-sounds/jixie/机械1.mp3`,
      `/sound/key-sounds/jixie/机械2.mp3`,
      `/sound/key-sounds/jixie/机械3.mp3`,
    ]
  } else {
    return [`/sound/key-sounds/${name}.mp3`]
  }
}
