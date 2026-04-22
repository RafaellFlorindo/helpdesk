import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  supabase,
  CATEGORIA_OPTIONS,
  PRIORIDADE_OPTIONS,
} from '../lib/supabase.js'

export default function NovoTicket() {
  const [searchParams] = useSearchParams()
  const email = (searchParams.get('email') || '').trim()
  const nome  = (searchParams.get('nome')  || '').trim()
  const navigate = useNavigate()

  const [categoria,  setCategoria]  = useState('')
  const [prioridade, setPrioridade] = useState('')
  const [titulo,     setTitulo]     = useState('')
  const [descricao,  setDescricao]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!categoria)       return setError('Selecione uma categoria.')
    if (!prioridade)      return setError('Selecione a prioridade.')
    if (!titulo.trim())   return setError('Informe o assunto do ticket.')

    setSubmitting(true)
    const { error } = await supabase.from('tickets').insert({
      email_cliente: email,
      nome_cliente:  nome || null,
      titulo:        titulo.trim(),
      descricao:     descricao.trim() || null,
      categoria,
      prioridade,
      status:        'novo',
    })
    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }

    // Volta pra lista preservando email/nome
    const q = new URLSearchParams()
    if (email) q.set('email', email)
    if (nome)  q.set('nome',  nome)
    navigate(`/cliente${q.toString() ? `?${q}` : ''}`)
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

  const backQuery = new URLSearchParams()
  if (email) backQuery.set('email', email)
  if (nome)  backQuery.set('nome',  nome)
  const backHref = `/cliente${backQuery.toString() ? `?${backQuery}` : ''}`

  return (
    <div className="min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <Link
          to={backHref}
          className="mb-2 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          ← Voltar aos tickets
        </Link>

        <h1 className="mb-1 text-2xl font-semibold text-gray-900">Novo Ticket de Suporte</h1>
        <p className="mb-6 text-sm text-gray-500">
          Preencha os campos abaixo para abrir um chamado.
        </p>

        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Categoria */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Categoria <span className="text-red-500">*</span>
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Selecione...</option>
                {CATEGORIA_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Prioridade */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Prioridade <span className="text-red-500">*</span>
              </label>
              <select
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Selecione...</option>
                {PRIORIDADE_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Assunto */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Assunto <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={200}
                required
                placeholder="Descreva brevemente o problema"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Descrição */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Descrição</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={5}
                placeholder="Descreva o problema em detalhes. Quanto mais informação, mais rápido conseguimos resolver."
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Abrir Ticket'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
