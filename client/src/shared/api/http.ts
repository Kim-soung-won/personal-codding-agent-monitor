import axios, { type AxiosInstance } from 'axios'
import { getApiBase, getAuthToken } from '@/shared/api/config'

/**
 * 공용 axios 인스턴스. Bearer 토큰을 요청마다 자동 주입하고 baseURL 을 붙인다.
 * apiFetch(수동 fetch 래퍼)를 대체하는 데이터 계층의 단일 HTTP 클라이언트다.
 * 토큰은 번들에 굽지 않고 localStorage 런타임 값을 매 요청 시 읽는다(config.ts).
 */
export const http: AxiosInstance = axios.create()

http.interceptors.request.use((cfg) => {
  cfg.baseURL = getApiBase()
  const token = getAuthToken()
  if (token) cfg.headers.set('Authorization', `Bearer ${token}`)
  return cfg
})
