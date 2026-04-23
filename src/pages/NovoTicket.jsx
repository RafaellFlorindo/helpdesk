import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, CATEGORIA_OPTIONS } from '../lib/supabase.js'

// Limite do anexo: 5 MB (ajuste aqui se quiser algo diferente).
const ANEXO_MAX_BYTES = 5 * 1024 * 1024
// Bucket do Supabase Storage onde as imagens ficam salvas.
// Precisa existir (criado via dashboard) e ser público pra URL funcionar.
const ANEXO_BUCKET = 'ticket-anexos'

export default function NovoTicket() {
  const [searchParams] = useSearchParams()
  const email        = (searchParams.get('email')         || '').trim()
  const nome         = (searchParams.get('nome')          || '').trim()
  const locationId   = (searchParams.get('location_id')   || '').trim()
  const locationName = (searchParams.get('location_name') || '').trim()
  const navigate = useNavigate()

  const [categoria,    setCategoria]    = useState('')
  const [titulo,       setTitulo]       = useState('')
  const [descricao,    setDescricao]    = useState('')
  const [anexo,        setAnexo]        = useState(null)
  const [anexoPreview, setAnexoPreview] = useState(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState(null)

  const hasScope = Boolean(locationId) || Boolean(email)

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) {
      setAnexo(null)
      setAnexoPreview(null)
      return
    }
    if (file.size > ANEXO_MAX_BYTES) {
      setError('A imagem precisa ter menos de 5 MB.')
      e.target.value = ''
      return
    }
    setError(null)
    setAnexo(file)

    // Gera preview (base64) pra mostrar a miniatura antes do envio.
    const reader = new FileReader()
    reader.onloadend = () => setAnexoPreview(reader.result)
    reader.readAsDataURL(file)
  }

  function removerAnexo() {
    setAnexo(null)
    setAnexoPreview(null)
    // Limpa o input file também (se não, não deixa re-selecionar o mesmo arquivo)
    const input = document.getElementById('anexo-input')
    if (input) input.value = ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!categoria)     return setError('Selecione uma categoria.')
    if (!titulo.trim()) return setError('Informe o assunto do ticket.')

    setSubmitting(true)

    // 1) Se tiver anexo, faz upload primeiro pra conseguir a URL pública.
    let anexoUrl = null
    if (anexo) {
      const ext  = (anexo.name.split('.').pop() || 'jpg').toLowerCase()
      const safe = Math.random().toString(36).slice(2)
      const path = `${Date.now()}-${safe}.${ext}`

      const { error: upErr } = await supabase.storage
        .from(ANEXO_BUCKET)
        .upload(path, anexo, {
          contentType: anexo.type || 'image/jpeg',
          upsert:      false,
        })

      if (upErr) {
        setSubmitting(false)
        setError('Erro ao enviar imagem: ' + upErr.message)
        return
      }

      const { data: urlData } = supabase.storage
        .from(ANEXO_BUCKET)
        .getPublicUrl(path)
      anexoUrl = urlData.publicUrl
    }

    // 2) Insere o ticket. Prioridade fica fixa em 'urgente' — todo cliente trata
    //    como urgente mesmo, então o campo some do form. Se precisar ajustar,
    //    o admin pode editar depois.
    const { data, error } = await supabase
      .from('tickets')
      .insert({
        email_cliente: email || null,
        nome_cliente:  nome  || null,
        location_id:   locationId   || null,
        location_name: locationName || null,
        titulo:        titulo.trim(),
        descricao:     descricao.trim() || null,
        categoria,
        prioridade:    'urgente',
        status:        'novo',
        anexo_url:     anexoUrl,
      })
      .select()
      .single()

    if (error) {
      setSubmitting(false)
      setError(error.message)
      return
    }

    setSubmitting(false)

    // Volta pra lista preservando contexto da subconta/cliente
    const q = new URLSearchParams()
    if (email)        q.set('email',         email)
    if (nome)         q.set('nome',          nome)
    if (locationId)   q.set('location_id',   locationId)
    if (locationName) q.set('location_name', locationName)
    navigate(`/cliente${q.toString() ? `?${q}` : ''}`)
  }

  // Acesso inválido
  if (!hasScope) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-red-800">Acesso inválido</h1>
          <p className="mt-2 text-sm text-red-700">
            Esta página precisa de email ou location_id na URL.
          </p>
        </div>
      </div>
    )
  }

  const backQuery = new URLSearchParams()
  if (email)        backQuery.set('email',         email)
  if (nome)         backQuery.set('nome',          nome)
  if (locationId)   backQuery.set('location_id',   locationId)
  if (locationName) backQuery.set('location_name', locationName)
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
          {locationName && (
            <>
              Subconta <span className="font-medium text-gray-700">{locationName}</span>
              {email && ' · '}
            </>
          )}
          {email && (
            <>
              Logado como <span className="font-medium text-gray-700">{email}</span>
            </>
          )}
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

            {/* Anexo / Imagem (opcional) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Imagem <span className="text-gray-400">(opcional)</span>
              </label>

              {!anexoPreview ? (
                <label
                  htmlFor="anexo-input"
                  className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 hover:border-indigo-400 hover:bg-indigo-50"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18v-1.5M16.5 12 12 7.5m0 0L7.5 12M12 7.5V18" />
                  </svg>
                  <span className="font-medium text-indigo-600">Clique para enviar</span>
                  <span className="text-xs text-gray-400">PNG, JPG · máx 5 MB</span>
                </label>
              ) : (
                <div className="relative inline-block">
                  <img
                    src={anexoPreview}
                    alt="Preview do anexo"
                    className="max-h-48 rounded-md border border-gray-200 object-contain"
                  />
                  <button
                    type="button"
                    onClick={removerAnexo}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow hover:bg-red-600"
                    aria-label="Remover imagem"
                  >
                    ×
                  </button>
                  <p className="mt-1 text-xs text-gray-500">{anexo?.name}</p>
                </div>
              )}

              <input
                id="anexo-input"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
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
