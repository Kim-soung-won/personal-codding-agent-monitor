import { queryOptions } from '@tanstack/react-query'
import * as api from '@/entities/commit-record/api/agentFactoryApi'
import type {
  RecordFilter,
  InvocationFilter,
} from '@/entities/commit-record/model/agentFactory'

/**
 * commit-record 도메인 react-query 옵션. 컴포넌트는 useQuery/useSuspenseQuery 에 이 옵션을
 * 넘겨 데이터를 읽는다. queryKey 는 도메인·리소스·파라미터로 계층화한다.
 */
const KEY = ['agent-factory'] as const

export const commitRecordQueries = {
  records: (filter: RecordFilter) =>
    queryOptions({
      queryKey: [...KEY, 'records', filter],
      queryFn: () => api.getRecords(filter),
    }),
  record: (id: string) =>
    queryOptions({
      queryKey: [...KEY, 'record', id],
      queryFn: () => api.getRecord(id),
    }),
  agentStats: () =>
    queryOptions({ queryKey: [...KEY, 'stats', 'agents'], queryFn: api.getAgentStats }),
  pluginStats: () =>
    queryOptions({ queryKey: [...KEY, 'stats', 'plugins'], queryFn: api.getPluginStats }),
  skillStats: () =>
    queryOptions({ queryKey: [...KEY, 'stats', 'skills'], queryFn: api.getSkillStats }),
  signalStats: () =>
    queryOptions({ queryKey: [...KEY, 'stats', 'signals'], queryFn: api.getSignalStats }),
  feedbackStats: () =>
    queryOptions({ queryKey: [...KEY, 'stats', 'feedback'], queryFn: api.getFeedbackStats }),
  dailyTokens: () =>
    queryOptions({ queryKey: [...KEY, 'stats', 'tokens-daily'], queryFn: api.getDailyTokens }),
  meta: () => queryOptions({ queryKey: [...KEY, 'meta'], queryFn: api.getMeta }),
  invocations: (filter: InvocationFilter) =>
    queryOptions({
      queryKey: [...KEY, 'invocations', filter],
      queryFn: () => api.getInvocations(filter),
    }),
}
