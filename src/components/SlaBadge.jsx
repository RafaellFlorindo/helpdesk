function formatShort(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/**
 * Mostra o status do SLA com um pontinho colorido:
 *  - Verde: No prazo
 *  - Amarelo: Perto de estourar (< 20% do tempo restante)
 *  - Vermelho: Estourado
 */
export default function SlaBadge({ deadline, createdAt, status }) {
  if (!deadline) {
    return <span className="text-xs text-gray-400">-</span>
  }

  // Se o ticket já foi resolvido/fechado, não mostra alerta
  const concluido = status === 'solucionado' || status === 'fechado'

  const now = Date.now()
  const deadlineMs = new Date(deadline).getTime()
  const createdMs  = createdAt ? new Date(createdAt).getTime() : deadlineMs - 72 * 3600 * 1000
  const total      = Math.max(deadlineMs - createdMs, 1)
  const restante   = deadlineMs - now
  const ratio      = restante / total

  let color = 'bg-green-500'
  let label = 'No prazo'

  if (!concluido) {
    if (restante <= 0) {
      color = 'bg-red-500'
      label = 'Estourado'
    } else if (ratio < 0.2) {
      color = 'bg-yellow-500'
      label = 'Perto do prazo'
    }
  } else {
    color = 'bg-gray-400'
    label = 'Concluído'
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-xs text-gray-600">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span className="font-medium">{label}</span>
      <span className="text-gray-400">— {formatShort(deadline)}</span>
    </div>
  )
}
