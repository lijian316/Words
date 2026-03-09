import {
  APP_VERSION,
  BACKUP_INDEX_KEY,
  BACKUP_KEY,
  WEBSITE_VERSION_HASH,
  LOCAL_FILE_KEY,
  SAVE_DICT_KEY,
  SAVE_SETTING_KEY,
} from '@/config/env.ts'
import {
  _getDictDataByUrl,
  checkAndUpgradeSaveDict,
  checkAndUpgradeSaveSetting,
  shakeCommonDict,
} from '@/utils/index.ts'
import { PRACTICE_ARTICLE_CACHE, PRACTICE_WORD_CACHE } from '@/utils/cache'
import { compareTimestamps, shouldFetchRemote } from '@/utils/sync'
import { del, get, set } from 'idb-keyval'
import { syncSetting } from '~/apis'
import { AppEnv, DictId } from '~/config/env.ts'
import { useBaseStore } from '~/stores/base.ts'
import { useRuntimeStore } from '~/stores/runtime.ts'
import { useSettingStore } from '~/stores/setting.ts'
import { useUserStore } from '~/stores/user.ts'
import { DictType } from '~/types/enum.ts'
import { Supabase } from '~/utils/supabase.ts'

let unsub = null
let unsub2 = null

type SyncType = 'setting' | 'dict'

type RemoteMetaRow = {
  type: SyncType
  updated_at?: string
  data_version?: number
}

type RemoteDataRow = RemoteMetaRow & {
  data: unknown
}

type HashBackupIndexItem = {
  hash: string
  key: string
  createdAt: number
}

function getDataVersion(type: SyncType): number {
  return type === 'dict' ? SAVE_DICT_KEY.version : SAVE_SETTING_KEY.version
}

function getLocalKey(type: SyncType): string {
  return type === 'dict' ? SAVE_DICT_KEY.key : SAVE_SETTING_KEY.key
}

async function getLocalPersistMeta(type: SyncType): Promise<{ updated_at?: string; version?: number }> {
  const raw = await get(getLocalKey(type))
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return {
      updated_at: typeof parsed?.updated_at === 'string' ? parsed.updated_at : undefined,
      version: typeof parsed?.version === 'number' ? parsed.version : undefined,
    }
  } catch {
    return {}
  }
}

async function persistLocalState(type: SyncType, val: unknown, updated_at?: string): Promise<void> {
  await set(
    getLocalKey(type),
    JSON.stringify({
      val,
      version: getDataVersion(type),
      updated_at,
    })
  )
}

function normalizeHash(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  return v.length > 0 ? v : null
}

async function saveHashSnapshot(currentHash: string, previousHash: string | null): Promise<void> {
  const backupKey = `${BACKUP_KEY}${currentHash}`
  const createdAt = Date.now()

  const snapshot = {
    meta: {
      currentHash,
      previousHash,
      createdAt,
    },
    data: {
      dict: await get(SAVE_DICT_KEY.key),
      setting: await get(SAVE_SETTING_KEY.key),
      appVersion: await get(APP_VERSION.key),
      practiceWord: import.meta.client ? localStorage.getItem(PRACTICE_WORD_CACHE.key) : null,
      practiceArticle: import.meta.client ? localStorage.getItem(PRACTICE_ARTICLE_CACHE.key) : null,
    },
  }
  await set(backupKey, snapshot)

  const rawIndex = (await get(BACKUP_INDEX_KEY)) as HashBackupIndexItem[] | undefined
  const index = Array.isArray(rawIndex)
    ? rawIndex.filter(item => item && typeof item.hash === 'string' && typeof item.key === 'string')
    : []

  index.push({ hash: currentHash, key: backupKey, createdAt })

  if (index.length > 15) {
    index.sort((a, b) => a.createdAt - b.createdAt)
    const removed = index.splice(0, index.length - 10)
    for (const item of removed) {
      await del(item.key)
    }
  }
  await set(BACKUP_INDEX_KEY, index)
}

async function fetchServerMeta(): Promise<RemoteMetaRow[] | null> {
  if (!Supabase.check()) return []
  const { data, error } = await Supabase.getInstance()
    .from('typewords_data')
    .select('type, updated_at, data_version')
    .in('type', ['setting', 'dict'])
  if (error) {
    Supabase.setStatus('error', error?.message ?? String(error))
    return null
  }
  return (data ?? []) as RemoteMetaRow[]
}

async function fetchServerData(type: SyncType): Promise<RemoteDataRow | null> {
  if (!Supabase.check()) return null
  const { data, error } = await Supabase.getInstance()
    .from('typewords_data')
    .select('type, data, updated_at, data_version')
    .eq('type', type)
    .maybeSingle()
  if (error) {
    Supabase.setStatus('error', error?.message ?? String(error))
    return null
  }
  return data as RemoteDataRow | null
}

async function upsertServerData(type: SyncType, data: unknown, updated_at: string): Promise<void> {
  if (!Supabase.check()) return
  const data_version = getDataVersion(type)
  try {
    const client = Supabase.getInstance() as any
    const { error } = await client
      .from('typewords_data')
      .upsert({ type, data, updated_at, data_version }, { onConflict: 'type' })
    if (error) {
      Supabase.setStatus('error', error?.message ?? String(error))
      return
    }
    Supabase.setStatus('success')
  } catch (e) {
    Supabase.setStatus('error', (e as Error)?.message ?? String(e))
  }
}

function applyDictData(store: ReturnType<typeof useBaseStore>, data: unknown) {
  store.setState(data as any)
  //todo 这里想办法优化，会重复加载
  if (store.word.studyIndex >= 3) {
    if (!store.sdict.custom && !store.sdict.words.length) {
      _getDictDataByUrl(store.sdict).then(r => {
        store.word.bookList[store.word.studyIndex] = r
      })
    }
  }
  if (store.article.studyIndex >= 1) {
    if (!store.sbook.custom && !store.sbook.articles.length) {
      _getDictDataByUrl(store.sbook, DictType.article).then(r => {
        store.article.bookList[store.article.studyIndex] = r
      })
    }
  }
}

async function getServerData() {
  if (!Supabase.check()) return
  const store = useBaseStore()
  const settingStore = useSettingStore()
  const syncLocalToRemote = (type: SyncType, updated_at: string) => {
    if (type === 'setting') {
      void persistLocalState('setting', settingStore.$state, updated_at)
      void upsertServerData('setting', settingStore.$state, updated_at)
      return
    }
    const data = shakeCommonDict(store.$state)
    void persistLocalState('dict', data, updated_at)
    void upsertServerData('dict', data, updated_at)
  }
  try {
    const remoteMetas = await fetchServerMeta()
    if (!remoteMetas) return
    const remoteMetaMap = new Map(remoteMetas.map(item => [item.type, item]))
    const syncTypes: SyncType[] = ['setting', 'dict']

    for (const type of syncTypes) {
      const remoteMeta = remoteMetaMap.get(type)
      const currentVersion = getDataVersion(type)
      const localMeta = await getLocalPersistMeta(type)
      if (!remoteMeta || remoteMeta.data_version == null) {
        const updated_at = localMeta.updated_at ?? new Date().toISOString()
        syncLocalToRemote(type, updated_at)
        continue
      }

      if (shouldFetchRemote(localMeta.updated_at, remoteMeta.updated_at, remoteMeta.data_version, currentVersion)) {
        const remoteData = await fetchServerData(type)
        if (!remoteData) continue

        if (type === 'setting') {
          const normalized = checkAndUpgradeSaveSetting({
            val: remoteData.data,
            version: remoteData.data_version ?? currentVersion,
          })
          settingStore.setState(normalized)
          await persistLocalState('setting', normalized, remoteData.updated_at)
        } else {
          const normalized = checkAndUpgradeSaveDict({
            val: remoteData.data,
            version: remoteData.data_version ?? currentVersion,
          })
          applyDictData(store, normalized)
          await persistLocalState('dict', normalized, remoteData.updated_at)
        }
        continue
      }

      const compareResult = compareTimestamps(localMeta.updated_at, remoteMeta.updated_at)
      if (compareResult === 'equal' || compareResult === 'unknown') {
        continue
      }

      if (localMeta.updated_at && compareResult === 'local_newer') {
        syncLocalToRemote(type, localMeta.updated_at)
      }
    }
    if (Supabase.getStatus().status !== 'error') {
      Supabase.setStatus('success')
    }
  } catch (e) {
    Supabase.setStatus('error', (e as Error)?.message ?? String(e))
  }
}

export function useInit() {
  const store = useBaseStore()
  const settingStore = useSettingStore()
  const runtimeStore = useRuntimeStore()
  const userStore = useUserStore()
  const runtimeConfig = useRuntimeConfig()
  let isInitializing = true // 标记是否正在初始化

  const ensureHashGuardBeforeInit = async () => {
    try {
      const currentHash = normalizeHash(runtimeConfig?.public?.latestCommitHash)
      if (!currentHash) return

      const localHash = normalizeHash(await get(WEBSITE_VERSION_HASH))
      if (localHash !== currentHash) {
        await saveHashSnapshot(localHash, '')
      }
      await set(WEBSITE_VERSION_HASH, currentHash)
    } catch (e) {
      console.warn('init hash guard failed', e)
    }
  }

  const onvisibilitychange = async () => {
    //如果标签页失活了就不保存数据了
    if (document.hidden) {
      isInitializing = true
    } else {
      //当激活时，要先获取数据，以保证本地是最新的，以免本地老数据上传到后端覆盖新数据
      isInitializing = true
      await getServerData()
      store.load = true
      settingStore.load = true
      isInitializing = false
    }
  }

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onvisibilitychange)
  })

  //init 有可能重复执行，因为从老网站导了数据之后需要 init
  async function init() {
    let lastAudioFileIdList = []

    document.removeEventListener('visibilitychange', onvisibilitychange)
    document.addEventListener('visibilitychange', onvisibilitychange)

    unsub?.()
    //用 $subscribe 替代 watch
    unsub = store.$subscribe(
      debounce((mutation, n) => {
        // 如果正在初始化，不保存数据，避免覆盖
        if (isInitializing) return
        console.log('store.$subscribe', mutation, n)
        let data = shakeCommonDict(n)
        const updated_at = new Date().toISOString()
        void persistLocalState('dict', data, updated_at)
        void upsertServerData('dict', data, updated_at)

        //筛选自定义和收藏
        let bookList = data.article.bookList.filter(v => v.custom || [DictId.articleCollect].includes(v.id))
        let audioFileIdList = []
        bookList.forEach(v => {
          //筛选 audioFileId 字体有值的
          v.articles
            .filter(s => !s.audioSrc && s.audioFileId)
            .forEach(a => {
              //所有 id 存起来，下次直接判断字符串是否相等，因为这个watch会频繁调用
              audioFileIdList.push(a.audioFileId)
            })
        })
        if (audioFileIdList.toString() !== lastAudioFileIdList.toString()) {
          let result = []
          //删除未使用到的文件
          get(LOCAL_FILE_KEY).then((fileList: Array<{ id: string; file: Blob }>) => {
            const files = fileList ?? []
            audioFileIdList.forEach(a => {
              let item = files.find(b => b.id === a)
              item && result.push(item)
            })
            set(LOCAL_FILE_KEY, result)
            lastAudioFileIdList = [...audioFileIdList]
          })
        }
      }, 1000)
    )

    unsub2?.()
    unsub2 = settingStore.$subscribe(
      debounce((mutation, state) => {
        if (isInitializing) return
        // console.log('settingStore.$subscribe', mutation, state, isInitializing)

        const updated_at = new Date().toISOString()
        void persistLocalState('setting', state, updated_at)
        void upsertServerData('setting', state, updated_at)
        if (AppEnv.CAN_REQUEST) {
          syncSetting(null, settingStore.$state)
        }
      }, 1000)
    )

    await ensureHashGuardBeforeInit()
    await userStore.init()
    await store.init()
    await settingStore.init()
    await getServerData()

    store.load = true
    isInitializing = false // 初始化完成，允许保存数据

    if (settingStore.first) {
      set(APP_VERSION.key, APP_VERSION.version)
    } else {
      get(APP_VERSION.key).then(r => {
        runtimeStore.isNew = r ? APP_VERSION.version > Number(r) : true
      })
    }

    runtimeStore.isError = Supabase.getStatus().status === 'error'
    window.umami?.track('host', { host: window.location.host })
  }

  return init
}
