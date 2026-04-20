import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Aviso útil durante o desenvolvimento
  // eslint-disable-next-line no-console
  console.warn(
    '[Helpdesk] Variáveis VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY não definidas.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
})

export const STATUS_OPTIONS = [
  { value: 'novo',         label: 'Novo' },
  { value: 'em_analise',   label: 'Em análise' },
  { value: 'solucionado',  label: 'Solucionado' },
  { value: 'fechado',      label: 'Fechado' },
]

export function statusLabel(status) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status
}
