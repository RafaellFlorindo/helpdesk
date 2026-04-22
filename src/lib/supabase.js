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

// -------- Status --------
export const STATUS_OPTIONS = [
  { value: 'novo',         label: 'Novo' },
  { value: 'em_analise',   label: 'Em análise' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'aguardando',   label: 'Aguardando' },
  { value: 'solucionado',  label: 'Solucionado' },
  { value: 'fechado',      label: 'Fechado' },
]

export function statusLabel(status) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status
}

// -------- Categoria --------
export const CATEGORIA_OPTIONS = [
  { value: 'bug',              label: 'Bug' },
  { value: 'duvida',           label: 'Dúvida' },
  { value: 'problema_tecnico', label: 'Problema técnico' },
  { value: 'customizacao',     label: 'Customização' },
  { value: 'sugestao',         label: 'Sugestão' },
  { value: 'outro',            label: 'Outro' },
]

export function categoriaLabel(cat) {
  return CATEGORIA_OPTIONS.find((c) => c.value === cat)?.label ?? (cat || '-')
}

// -------- Prioridade --------
export const PRIORIDADE_OPTIONS = [
  { value: 'baixa',   label: 'Baixa',   hours: 168 },
  { value: 'media',   label: 'Média',   hours: 72  },
  { value: 'alta',    label: 'Alta',    hours: 24  },
  { value: 'urgente', label: 'Urgente', hours: 4   },
]

export function prioridadeLabel(p) {
  return PRIORIDADE_OPTIONS.find((o) => o.value === p)?.label ?? (p || '-')
}

export function prioridadeHoras(p) {
  return PRIORIDADE_OPTIONS.find((o) => o.value === p)?.hours ?? 72
}
