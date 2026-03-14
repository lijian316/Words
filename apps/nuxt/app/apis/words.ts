import http from '@typewords/core/utils/http.ts'
import type { Dict } from '@typewords/core/types/types.ts'

export function wordDelete(params?, data?) {
  return http<Dict>('word/delete', data, params, 'post')
}
