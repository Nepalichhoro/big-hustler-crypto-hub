import type { Toast } from '../types'

type Props = {
  toasts: Toast[]
}

export function Toaster({ toasts }: Props) {
  if (!toasts.length) return null
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <span className="toast-dot" />
          <p className="toast-text">{t.message}</p>
        </div>
      ))}
    </div>
  )
}
