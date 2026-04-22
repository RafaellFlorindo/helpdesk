import { statusLabel } from '../lib/supabase.js'

const STYLES = {
  novo:         'bg-blue-100   text-blue-800   ring-blue-200',
  em_analise:   'bg-yellow-100 text-yellow-800 ring-yellow-200',
  em_andamento: 'bg-amber-100  text-amber-800  ring-amber-200',
  aguardando:   'bg-purple-100 text-purple-800 ring-purple-200',
  solucionado:  'bg-green-100  text-green-800  ring-green-200',
  fechado:      'bg-gray-200   text-gray-700   ring-gray-300',
}

export default function StatusBadge({ status }) {
  const cls = STYLES[status] ?? 'bg-gray-100 text-gray-700 ring-gray-200'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {statusLabel(status)}
    </span>
  )
}
