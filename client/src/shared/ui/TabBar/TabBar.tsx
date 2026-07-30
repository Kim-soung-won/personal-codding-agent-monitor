import { cn } from '@/shared/lib/utils'

/** 라우트 탭 전환 바. 세션·프로젝트 페이지가 공유한다. */
export function TabBar<T extends string>({
  tabs, activeTab, onSelect,
}: {
  tabs: { id: T; label: string }[]
  activeTab: T
  onSelect: (id: T) => void
}) {
  return (
    <div className="shrink-0 border-b flex overflow-x-auto">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={cn(
            'px-4 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors',
            activeTab === t.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
