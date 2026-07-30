import type { AssistantBlockCategory } from '@/entities/session/model/groupChatTurns'

/** assistant 블록 카테고리별 표시 설정(색·아이콘·기본 펼침). 블록 렌더러들이 공유한다. */
export interface BlockConfig {
  accentBorder: string
  accentBg: string
  iconColor: string
  labelColor: string
  icon: string
  label: string
  defaultOpen: boolean
}

export const BLOCK_CONFIG: Record<AssistantBlockCategory, BlockConfig> = {
  thinking: {
    accentBorder: 'border-l-[3px] border-violet-500',
    accentBg:     'bg-violet-500/5 dark:bg-violet-500/8',
    iconColor:    'text-violet-500',
    labelColor:   'text-violet-600 dark:text-violet-400',
    icon: 'M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26A7 7 0 0 1 12 2z', // brain-ish
    label: 'Thinking',
    defaultOpen: false,
  },
  'tool-use': {
    accentBorder: 'border-l-[3px] border-amber-500',
    accentBg:     'bg-amber-500/5 dark:bg-amber-500/8',
    iconColor:    'text-amber-500',
    labelColor:   'text-amber-600 dark:text-amber-400',
    icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z', // tool
    label: 'Function Call',
    defaultOpen: true,
  },
  'tool-result-ok': {
    accentBorder: 'border-l-[3px] border-emerald-500',
    accentBg:     'bg-emerald-500/5 dark:bg-emerald-500/8',
    iconColor:    'text-emerald-500',
    labelColor:   'text-emerald-600 dark:text-emerald-400',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', // check-circle
    label: 'Function Response',
    defaultOpen: false,
  },
  'tool-result-error': {
    accentBorder: 'border-l-[3px] border-rose-500',
    accentBg:     'bg-rose-500/5 dark:bg-rose-500/8',
    iconColor:    'text-rose-500',
    labelColor:   'text-rose-600 dark:text-rose-400',
    icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', // x-circle
    label: 'Function Error',
    defaultOpen: true,
  },
  'assistant-text': {
    accentBorder: '',
    accentBg:     '',
    iconColor:    'text-blue-500',
    labelColor:   'text-muted-foreground',
    icon: '', // no icon for text blocks
    label: '',
    defaultOpen: true,
  },
}
