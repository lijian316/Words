import http from '@typewords/core/utils/http.ts'
import type { Dict } from '@typewords/core/types/types.ts'

export function copyOfficialDict(params?, data?) {
  return http<Dict>('dict/copyOfficialDict', data, params, 'post')
}

export function deleteDict(params?, data?) {
  return http<Dict>('dict/delete', data, params, 'post')
}
