import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import StatusBadge from '../components/StatusBadge.jsx'

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

export default function Cliente() {
  const [searchParams] = useSearchParams()
  const email = (searchParams.get('email') || '').trim()
  const nome  = (searchParams.get('nome')  || '').trim()

  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const [titulo, setTitulo]         = useState('')
  const [descricao, setDescricao]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

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

  async function handleSubmit(e) {
    e.preventDefault()
    setSuccessMsg('')
    setError(null)

    if (!titulo.trim()) {
      setError('Informe um título para o ticket.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('tickets').insert({
      email_cliente: email,
      nome_cliente:  nome || null,
      titulo:        titulo.trim(),
      descricao:     descricao.trim() || null,
      status:        'novo',
    })
    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }
    setTitulo('')
    setDescricao('')
    setSuccessMsg('Ticket aberto com sucesso!')
    fetchTickets()
  }

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

  return (
    <div className="min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-gray-900">Central de Atendimento</h1>
          <p className="text-sm text-gray-500">
            Logado como <span className="font-medium text-gray-700">{email}</span>
          </p>
        </header>

        {/* Formulário de novo ticket */}
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Abrir novo ticket</h2>

          {successMsg && (
            <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {successMsg}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Título</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={200}
                required
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                placeholder="Descreva rapidamente o assunto"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Descrição</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                placeholder="Detalhe o que está acontecendo..."
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Abrir ticket'}
            </button>
          </form>
        </section>

        {/* Lista de tickets do cliente */}
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Meus tickets</h2>
          </div>

          {loading ? (
            <div className="p-6 text-center text-sm text-gray-500">Carregando...</div>
          ) : tickets.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              Você ainda não abriu nenhum ticket.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {tickets.map((t) => (
                <li key={t.id} className="p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900">{t.titulo}</h3>
                      {t.descricao && (
                        <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap break-words">
                          {t.descricao}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-gray-400">
                        Aberto em {formatDate(t.created_at)}
                        {t.updated_at ? ` • Atualizado em ${formatDate(t.updated_at)}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
