import { WelcomeDashboard } from '@/pages/home/ui/WelcomeDashboard'
import { DarkToggle } from '@/shared/ui/DarkToggle'

export function HomePage() {
  return (
    <>
      <header className="shrink-0 flex items-center justify-end gap-3 px-4 border-b h-12">
        <DarkToggle />
      </header>
      <main className="flex-1 overflow-y-auto p-4">
        <WelcomeDashboard />
      </main>
    </>
  )
}
