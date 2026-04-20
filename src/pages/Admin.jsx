import { useEffect, useMemo, useState } from 'react'
import { supabase, STATUS_OPTIONS } from '../lib/supabase.js'
import StatusBadge from '../components/StatusBadge.jsx'

const FILTERS = [
  { value: 'todos',       label: 'Todos' },
  { value: 'novo',        label: 'Novo' },
  { value: 'em_analise',  label: 'Em análise' },
  { value: 'solucionado', label: 'Solucionado' },
  { value: 'fechado',     label: 'Fechado' },
]

function formatDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function Admin() {
  const [tickets, setTickets]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [error,   setError]         = useState(null)
  const [statusFilter, setStatusFilter] = useState('todos')
  const [search, setSearch]         = useState('')
  const [updatingId, setUpdatingId] = useState(null)

  async function fetchTickets() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setTickets(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchTickets()

    // Realtime: escuta mudanças na tabela
    const channel = supabase
      .channel('tickets-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => fetchTickets()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function handleChangeStatus(ticket, newStatus) {
    setUpdatingId(ticket.id)
    // Atualização otimista
    setTickets((prev) =>
      prev.map((t) => (t.id === ticket.id ? { ...t, status: newStatus } : t))
    )
    const { error } = await supabase
      .from('tickets')
      .update({ status: newStatus })
      .eq('id', ticket.id)

    if (error) {
      setError(error.message)
      // Reverte em caso de falha
      setTickets((prev) =>
        prev.map((t) => (t.id === ticket.id ? { ...t, status: ticket.status } : t))
      )
    }
    setUpdatingId(null)
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return tickets.filter((t) => {
      const matchStatus = statusFilter === 'todos' || t.status === statusFilter
      const matchSearch =
        !term ||
        (t.email_cliente || '').toLowerCase().includes(term) ||
        (t.titulo || '').toLowerCase().includes(term)
      return matchStatus && matchSearch
    })
  }, [tickets, statusFilter, search])

  return (
    <div className="min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Painel de Tickets</h1>
          <p className="text-sm text-gray-500">Gerencie todos os chamados recebidos.</p>
        </header>

        {/* Filtros + busca */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = f.value === statusFilter
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
                    active
                      ? 'bg-gray-900 text-white ring-gray-900'
                      : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por email ou título..."
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 sm:max-w-xs"
          />
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
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Título</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Alterar</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Aberto em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                      Carregando...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                      Nenhum ticket encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{t.email_cliente}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{t.titulo}</div>
                        {t.descricao && (
                          <div className="mt-0.5 max-w-md truncate text-xs text-gray-500">
                            {t.descricao}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <select
                          value={t.status}
                          disabled={updatingId === t.id}
                          onChange={(e) => handleChangeStatus(t, e.target.value)}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
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
