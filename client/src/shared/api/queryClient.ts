import { QueryClient } from '@tanstack/react-query'

/**
 * 앱 전역 react-query 클라이언트. 집계 대시보드 성격상 과도한 재요청을 피하도록
 * staleTime 을 넉넉히 두고, 실패는 1회만 재시도한다(방어적 데이터 계층과 정합).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
