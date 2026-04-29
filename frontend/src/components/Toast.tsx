import { useEffect } from 'react'
import { CheckmarkCircle24Regular, DismissCircle24Regular } from '@fluentui/react-icons'

interface Props {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
  duration?: number
}

export function Toast({ message, type = 'success', onClose, duration = 4000 }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [message])

  const bg = type === 'error' ? '#c62828' : '#1e7e34'

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: bg, color: '#fff', borderRadius: 8,
      padding: '12px 20px', fontSize: 14, fontWeight: 500,
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', gap: 10,
      maxWidth: 360,
    }}>
      {type === 'error'
        ? <DismissCircle24Regular fontSize={18} />
        : <CheckmarkCircle24Regular fontSize={18} />}
      {message}
    </div>
  )
}
