import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** 헤더 아래·본문 위에 고정 배치(예: FilterBar) */
  toolbar?: ReactNode
  children: ReactNode
}

/** 페이지 표준 레이아웃 — 헤더 + (선택)툴바 + 스크롤 본문. */
export function PageShell({ title, subtitle, actions, toolbar, children }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="shrink-0 flex items-center gap-3 px-4 border-b border-border h-12">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold truncate">{title}</h1>
          {subtitle && <p className="text-2xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
      {toolbar}
      <main className="flex-1 overflow-y-auto p-4">{children}</main>
    </div>
  )
}
