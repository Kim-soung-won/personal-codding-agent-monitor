import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTheme } from '@/shared/lib/useTheme'
import { cn } from '@/shared/lib/utils'

interface NavItem {
  label: string
  to: string
  icon: ReactNode
  badge?: 'NEW' | 'Soon'
  disabled?: boolean
}

// 밀도형 대시보드 네비게이션. Projects·Compare는 로컬 파일 모드 전용 레거시 뷰.
const NAV: NavItem[] = [
  { label: '커밋 기록', to: '/', badge: 'NEW', icon: <IconGauge /> },
  // 평가 축은 개별 실행 단위(에이전트·스킬). 플러그인은 배포 단위라 성능 신호가
  // 상쇄돼 집계 축에서 뺀다 — 소속은 각 목록의 plugin 컬럼으로 본다.
  { label: 'Sub-agents', to: '/subagents', icon: <IconAgent /> },
  { label: 'Skills', to: '/skills', icon: <IconSpark /> },
  { label: 'Projects', to: '/projects', icon: <IconFolder /> },
  { label: 'Compare', to: '/compare', icon: <IconCompare /> },
  { label: 'Pricing 참고', to: '/reference/pricing', icon: <IconBook /> },
]

interface Props {
  connected: boolean
  children: ReactNode
}

/** 앱 셸 — 좌측 고정 네비 + 우측 콘텐츠. 밀도형 분석 대시보드용. */
export function AppShell({ connected, children }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, toggle } = useTheme()

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      <aside
        className="w-52 shrink-0 flex flex-col h-full overflow-hidden border-r"
        style={{ background: 'hsl(var(--sidebar))', borderColor: 'hsl(var(--sidebar-border))' }}
      >
        {/* Brand */}
        <div className="px-4 h-12 flex items-center gap-2.5 shrink-0 border-b" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
          <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">C</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-none">Observer</p>
            <p className="text-2xs text-muted-foreground mt-0.5">Analytics</p>
          </div>
          <span
            className={cn('w-2 h-2 rounded-full shrink-0', connected ? 'bg-success' : 'bg-destructive')}
            title={connected ? 'Connected' : 'Disconnected'}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(item.to)
            return (
              <button
                key={item.to}
                disabled={item.disabled}
                onClick={() => !item.disabled && navigate(item.to)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-xs font-medium transition-colors',
                  active && !item.disabled
                    ? 'bg-primary/10 text-primary'
                    : item.disabled
                      ? 'text-muted-foreground/50 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                <span className="w-4 h-4 shrink-0">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span
                    className={cn(
                      'text-[9px] font-semibold px-1 py-0.5 rounded',
                      item.badge === 'NEW'
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground/70',
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Footer: theme */}
        <div className="p-2 border-t shrink-0" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
          <button
            onClick={toggle}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <span className="w-4 h-4 shrink-0">{dark ? <IconSun /> : <IconMoon />}</span>
            {dark ? '라이트 모드' : '다크 모드'}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</div>
    </div>
  )
}

// ─── inline icons (stroke=currentColor) ─────────────────────────────
function svg(path: ReactNode) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-full h-full">
      {path}
    </svg>
  )
}
function IconGauge() { return svg(<><path strokeLinecap="round" d="M12 14l3-3" /><path strokeLinecap="round" d="M4 18a8 8 0 1116 0" /></>) }
function IconAgent() { return svg(<><rect x="4" y="8" width="16" height="12" rx="2" /><path strokeLinecap="round" d="M12 8V4M9 14h.01M15 14h.01" /></>) }
function IconFolder() { return svg(<path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />) }
function IconCompare() { return svg(<><path strokeLinecap="round" d="M12 3v18M6 8l-3 3 3 3M18 8l3 3-3 3" /></>) }
function IconBook() { return svg(<path strokeLinecap="round" strokeLinejoin="round" d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2V5zM8 3v14" />) }
function IconSpark() { return svg(<path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" />) }
function IconSun() { return svg(<><circle cx="12" cy="12" r="4" /><path strokeLinecap="round" d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>) }
function IconMoon() { return svg(<path strokeLinecap="round" d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />) }
