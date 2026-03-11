import { useBaseStore } from '@/stores/base.ts'
import type { PracticeData, TaskWords, Word } from '@/types/types.ts'
import type {
  PracticeArticleCache,
  PracticeWordCache,
  PracticeWordCacheCompact,
  PracticeWordCacheStored,
} from '@/utils/cache'
import {
  getPracticeArticleCacheLocal,
  getPracticeArticleCacheLocalWithMeta,
  getPracticeWordCacheLocal,
  getPracticeWordCacheLocalWithMeta,
  PRACTICE_ARTICLE_CACHE,
  PRACTICE_WORD_CACHE,
  setPracticeArticleCacheLocal,
  setPracticeWordCacheLocal,
} from '@/utils/cache'
import { Supabase } from '@/utils/supabase'
import { shouldFetchRemoteV2 } from '@/utils/sync'
import { CompareResult } from '~/types/enum'

const PRACTICE_TYPE_WORD = 'practice_word'
const PRACTICE_TYPE_ARTICLE = 'practice_article'

type PracticeKind = 'word' | 'article'

type RemoteRow = {
  data: PracticeWordCacheStored | PracticeArticleCache | null
  updated_at?: string
  data_version?: number
}

type RemoteMetaRow = {
  updated_at?: string
  data_version?: number
}

function getType(kind: PracticeKind): string {
  return kind === 'word' ? PRACTICE_TYPE_WORD : PRACTICE_TYPE_ARTICLE
}

function getVersion(kind: PracticeKind): number {
  return kind === 'word' ? PRACTICE_WORD_CACHE.version : PRACTICE_ARTICLE_CACHE.version
}

async function fetchMetaFromSupabase(kind: PracticeKind): Promise<RemoteMetaRow | null> {
  if (!Supabase.check()) return null
  const typeName = getType(kind)
  try {
    const { data, error } = await Supabase.getInstance()
      .from('typewords_data')
      .select('updated_at, data_version')
      .eq('type', typeName)
      .maybeSingle()
    if (error) {
      Supabase.setStatus('error', error?.message ?? String(error))
      return null
    }
    return data as RemoteMetaRow | null
  } catch (e) {
    Supabase.setStatus('error', (e as Error)?.message ?? String(e))
    return null
  }
}

async function fetchFromSupabase(kind: PracticeKind): Promise<RemoteRow | null> {
  if (!Supabase.check()) return null
  const typeName = getType(kind)
  try {
    const { data, error } = await Supabase.getInstance()
      .from('typewords_data')
      .select('data, updated_at, data_version')
      .eq('type', typeName)
      .maybeSingle()
    if (error) {
      Supabase.setStatus('error', error?.message ?? String(error))
      return null
    }
    return data as RemoteRow | null
  } catch (e) {
    Supabase.setStatus('error', (e as Error)?.message ?? String(e))
    return null
  }
}

async function upsertPracticeData(
  kind: PracticeKind,
  data: PracticeWordCacheStored | PracticeArticleCache | null,
  updated_at: string
): Promise<void> {
  if (!Supabase.check()) return
  const type = getType(kind)
  const data_version = getVersion(kind)
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

function isCompactPracticeWordCache(data: PracticeWordCacheStored | null): data is PracticeWordCacheCompact {
  return !!data && 'taskWordsStr' in data
}

function createWordMap(): Map<string, Word> {
  const store = useBaseStore()
  return new Map(store.sdict.words.map(word => [word.word, word]))
}

function restoreWords(words: string[], wordMap: Map<string, Word>): Word[] {
  return words.map(word => wordMap.get(word)).filter((word): word is Word => !!word)
}

function serializePracticeWordCache(data: PracticeWordCache | null): PracticeWordCacheStored | null {
  if (!data) return null
  const { words, wrongWords, ...practiceDataRest } = data.practiceData
  return {
    taskWordsStr: {
      new: data.taskWords.new.map(v => v.word),
      review: data.taskWords.review.map(v => v.word),
    },
    practiceData: {
      ...practiceDataRest,
      wordsStr: words.map(v => v.word),
      wrongWordsStr: wrongWords.map(v => v.word),
    },
    statStoreData: data.statStoreData,
  }
}

function restorePracticeWordCache(data: PracticeWordCacheStored | null): PracticeWordCache | null {
  if (!data) return null
  if (!isCompactPracticeWordCache(data)) {
    if (!data.taskWords?.new.length && !data.taskWords?.review.length) return null
    return data
  }
  if (!data.taskWordsStr?.new.length && !data.taskWordsStr?.review.length) return null
  const wordMap = createWordMap()
  const taskWords: TaskWords = {
    new: restoreWords(data.taskWordsStr.new, wordMap),
    review: restoreWords(data.taskWordsStr.review, wordMap),
  }

  const words = restoreWords(data.practiceData?.wordsStr ?? [], wordMap)
  const wrongWords = restoreWords(data.practiceData?.wrongWordsStr ?? [], wordMap)
  const index = words.length ? Math.min(data.practiceData.index, words.length - 1) : 0

  const practiceData: PracticeData = {
    ...data.practiceData,
    index,
    words,
    wrongWords,
  }
  return {
    taskWords,
    practiceData,
    statStoreData: data.statStoreData,
  }
}

export function usePracticeWordPersistence() {
  async function load(): Promise<PracticeWordCache | null> {
    const res = await fetch()
    return res ?? restorePracticeWordCache(getPracticeWordCacheLocal())
  }

  async function fetch(): Promise<PracticeWordCache | null> {
    const compareResult = await fetchCompareResult()
    if (compareResult === CompareResult.RemoteNewer) {
      const remote = await fetchFromSupabase('word')
      const remoteData = remote?.data as PracticeWordCacheStored
      setPracticeWordCacheLocal(remoteData, remote?.updated_at)
      return restorePracticeWordCache(remoteData)
    }
    return null
  }

  async function getLocalDataCompact(): Promise<PracticeWordCacheStored> {
    return getPracticeWordCacheLocal()
  }

  async function fetchCompareResultLogWrap(): Promise<CompareResult> {
    const remoteMeta = await fetchMetaFromSupabase('word')
    if (!remoteMeta) return CompareResult.NoRemote
    const localMeta = getPracticeWordCacheLocalWithMeta()
    if (!localMeta) return CompareResult.NoLocal
    const currentVersion = PRACTICE_WORD_CACHE.version
    return shouldFetchRemoteV2(localMeta?.updated_at, remoteMeta?.updated_at, remoteMeta?.data_version, currentVersion)
  }

  async function fetchCompareResult(): Promise<CompareResult> {
    const result = await fetchCompareResultLogWrap()
    console.log('CompareResult', CompareResult[result])
    return result
  }

  async function save(data: PracticeWordCache | null) {
    const compareResult = await fetchCompareResult()
    const updated_at = new Date().toISOString()
    const compactData = serializePracticeWordCache(data)
    if (compareResult === CompareResult.NoRemote) {
      setPracticeWordCacheLocal(compactData, updated_at)
    } else if (compareResult === CompareResult.RemoteNewer) {
      const remote = await fetchFromSupabase('word')
      setPracticeWordCacheLocal(remote?.data as PracticeWordCacheStored, remote?.updated_at)
    } else {
      setPracticeWordCacheLocal(compactData, updated_at)
      await upsertPracticeData('word', compactData, updated_at)
    }
  }

  function clear(): void {
    setPracticeWordCacheLocal(null)
    const updated_at = new Date().toISOString()
    void upsertPracticeData('word', null, updated_at)
  }

  return { load, save, clear, fetch, getLocalDataCompact }
}

export function usePracticeArticlePersistence() {
  async function fetchCompareResultLogWrap(): Promise<CompareResult> {
    const remoteMeta = await fetchMetaFromSupabase('article')
    if (!remoteMeta) return CompareResult.NoRemote
    const localMeta = getPracticeArticleCacheLocalWithMeta()
    if (!localMeta) return CompareResult.NoLocal
    const currentVersion = PRACTICE_ARTICLE_CACHE.version
    return shouldFetchRemoteV2(localMeta?.updated_at, remoteMeta?.updated_at, remoteMeta?.data_version, currentVersion)
  }

  async function fetchCompareResult(): Promise<CompareResult> {
    const result = await fetchCompareResultLogWrap()
    console.log('CompareResult', CompareResult[result])
    return result
  }

  async function load(): Promise<PracticeArticleCache | null> {
    const res = await fetch()
    return res ?? getPracticeArticleCacheLocal()
  }

  async function getLocalDataCompact(): Promise<PracticeArticleCache | null> {
    return getPracticeArticleCacheLocal()
  }

  async function fetch(): Promise<PracticeArticleCache | null> {
    const compareResult = await fetchCompareResult()
    if (compareResult === CompareResult.RemoteNewer) {
      const remote = await fetchFromSupabase('article')
      const remoteData = remote?.data as PracticeArticleCache
      setPracticeArticleCacheLocal(remoteData, remote?.updated_at)
      return remoteData
    }
    return null
  }

  async function save(data: PracticeArticleCache | null): Promise<void> {
    const compareResult = await fetchCompareResult()
    const updated_at = new Date().toISOString()
    if (compareResult === CompareResult.NoRemote) {
      setPracticeArticleCacheLocal(data, updated_at)
    } else if (compareResult === CompareResult.RemoteNewer) {
      const remote = await fetchFromSupabase('article')
      const remoteData = remote?.data as PracticeArticleCache
      setPracticeArticleCacheLocal(remoteData, remote?.updated_at)
    } else {
      setPracticeArticleCacheLocal(data, updated_at)
      await upsertPracticeData('article', data ?? null, updated_at)
    }
  }

  function clear(): void {
    setPracticeArticleCacheLocal(null)
    const updated_at = new Date().toISOString()
    void upsertPracticeData('article', null, updated_at)
  }

  return { load, save, clear, fetch, getLocalDataCompact }
}
