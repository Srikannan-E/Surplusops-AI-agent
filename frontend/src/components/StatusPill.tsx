type Props = {
  children: string
  tone?: 'simulated' | 'success' | 'blocked' | 'neutral'
}

export function StatusPill({ children, tone = 'neutral' }: Props) {
  return <span className={`status-pill ${tone}`}>{children}</span>
}
