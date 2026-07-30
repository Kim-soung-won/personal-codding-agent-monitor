import { useState, type FormEvent, type ReactNode } from 'react'
import { getApiBase, getAuthToken, setAuthToken } from '@/shared/api/config'

interface Props {
  children: ReactNode
}

/**
 * 토큰이 없으면 입력 폼을 띄우고, 검증에 성공해야 children 을 렌더링한다.
 * 토큰은 검증 요청(/api/sessions)이 200 을 반환할 때만 저장한다.
 */
export function AuthGate({ children }: Props) {
  const [authed, setAuthed] = useState<boolean>(() => getAuthToken() != null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const token = input.trim()
    if (!token) return

    setChecking(true)
    setError(null)
    try {
      const res = await fetch(`${getApiBase()}/api/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setAuthToken(token)
        setAuthed(true)
      } else if (res.status === 401) {
        setError('토큰이 올바르지 않습니다.')
      } else {
        setError(`서버 오류 (${res.status})`)
      }
    } catch {
      setError('서버에 연결할 수 없습니다.')
    } finally {
      setChecking(false)
    }
  }

  if (authed) return <>{children}</>

  return (
    <div className="h-screen flex items-center justify-center bg-background text-foreground">
      <form
        onSubmit={handleSubmit}
        className="w-80 rounded-xl border border-border bg-card p-6 flex flex-col gap-4"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">C</span>
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Claude Observer</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">접근 토큰 입력</p>
          </div>
        </div>

        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Access token"
          autoFocus
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={checking || input.trim().length === 0}
          className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium disabled:opacity-50 transition-opacity"
        >
          {checking ? '확인 중…' : '접속'}
        </button>
      </form>
    </div>
  )
}
