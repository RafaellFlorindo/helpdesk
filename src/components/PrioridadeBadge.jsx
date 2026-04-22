import { prioridadeLabel } from '../lib/supabase.js'

const STYLES = {
  baixa:   'bg-gray-100   text-gray-700   ring-gray-200',
  media:   'bg-yellow-100 text-yellow-800 ring-yellow-200',
  alta:    'bg-orange-100 text-orange-800 ring-orange-200',
  urgente: 'bg-red-100    text-red-800    ring-red-200',
}

export default function PrioridadeBadge({ prioridade }) {
  if (!prioridade) {
    return <span className="text-xs text-gray-400">-</span>
  }
  const cls = STYLES[prioridade] ?? 'bg-gray-100 text-gray-700 ring-gray-200'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {prioridadeLabel(prioridade)}
    </span>
  )
}
