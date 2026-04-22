import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, categoriaLabel } from '../lib/supabase.js'
import StatusBadge from '../components/StatusBadge.jsx'
import PrioridadeBadge from '../components/PrioridadeBadge.jsx'
import SlaBadge from '../components/SlaBadge.jsx'

const FILTERS = [
  { value: 'todos',        label: 'Todos' },
  { value: 'novo',         label: 'Novos' },
  { value: 'em_analise',   label: 'Em Análise' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'aguardando',   label: 'Aguardando' },
  { value: 'solucionado',  label: 'Solucionados' },
  { value: 'fechado',      label: 'Fechados' },
]

function formatDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function Cliente() {
  const [searchParams] = useSearchParams()
  const email = (searchParams.get('email') || '').trim()
  const nome  = (searchParams.get('nome')  || '').trim()

  const [tickets, setTickets]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)
  const [statusFilter, setStatusFilter] = useState('todos')

  async function fetchTickets() {
    if (!email) return
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('email_cliente', email)
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setTickets(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!email) {
      setLoading(false)
      return
    }
    fetchTickets()

    const channel = supabase
      .channel(`tickets-cliente-${email}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `email_cliente=eq.${email}`,
        },
        () => fetchTickets()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  const filtered = useMemo(() => {
    return tickets.filter(
      (t) => statusFilter === 'todos' || t.status === statusFilter
    )
  }, [tickets, statusFilter])

  // Acesso inválido: sem email
  if (!email) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-red-800">Acesso inválido</h1>
          <p className="mt-2 text-sm text-red-700">
            Esta página precisa ser acessada com um email válido na URL.
            Exemplo: <code className="rounded bg-red-100 px-1">?email=cliente@dominio.com</code>
          </p>
        </div>
      </div>
    )
  }

  const novoQuery = new URLSearchParams()
  if (email) novoQuery.set('email', email)
  if (nome)  novoQuery.set('nome',  nome)
  const novoHref = `/cliente/novo${novoQuery.toString() ? `?${novoQuery}` : ''}`

  return (
    <div className="min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        {/* Cabeçalho */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Meus Tickets</h1>
            <p className="text-sm text-gray-500">
              Logado como <span className="font-medium text-gray-700">{email}</span>
            </p>
          </div>
          <Link
            to={novoHref}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            Novo Ticket
          </Link>
        </div>

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = f.value === statusFilter
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
                  active
                    ? 'bg-indigo-600 text-white ring-indigo-600'
                    : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Tabela */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Ticket</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Assunto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Categoria</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Prioridade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">SLA</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Aberto em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                      Carregando...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                      Nenhum ticket encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-indigo-600 whitespace-nowrap">
                        {t.numero_ticket || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{t.titulo}</div>
                        {t.descricao && (
                          <div className="mt-0.5 max-w-md truncate text-xs text-gray-500">
                            {t.descricao}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        {categoriaLabel(t.categoria)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <PrioridadeBadge prioridade={t.prioridade} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <SlaBadge
                          deadline={t.sla_deadline}
                          createdAt={t.created_at}
                          status={t.status}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {formatDate(t.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Mostrando {filtered.length} de {tickets.length} ticket(s).
        </p>
      </div>
    </div>
  )
}
