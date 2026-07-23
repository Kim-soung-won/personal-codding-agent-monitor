/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 클라우드 배포 시 서버 REST 베이스 URL. 미설정 시 http://localhost:3001 */
  readonly VITE_API_BASE?: string
  /** 클라우드 배포 시 WebSocket URL. 미설정 시 ws://localhost:3001 */
  readonly VITE_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
