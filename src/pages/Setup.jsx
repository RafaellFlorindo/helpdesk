import { useEffect, useMemo, useState } from 'react'

// =============================================================
// Wizard de configuração — para agências replicarem o snapshot.
// Acesse via /setup. Estado salvo em localStorage.
// =============================================================

const STORAGE_KEY = 'helpdesk_setup_v1'

const STEPS = [
  { id: 'welcome',     title: 'Início',            short: 'Início' },
  { id: 'supabase',    title: 'Supabase',          short: 'Supabase' },
  { id: 'deploy',      title: 'Deploy do App',     short: 'Deploy' },
  { id: 'pipeline',    title: 'Pipeline no GHL',   short: 'Pipeline' },
  { id: 'fields',      title: 'Custom Field',      short: 'Custom Field' },
  { id: 'inbound',     title: 'Workflow Inbound',  short: 'Inbound' },
  { id: 'sync',        title: 'Workflow Sync',     short: 'Sync' },
  { id: 'test',        title: 'Testar',            short: 'Testar' },
  { id: 'done',        title: 'Pronto',            short: 'Fim' },
]

// SQL embutido — mesmo conteúdo dos arquivos em supabase/.
const SCHEMA_SQL = `-- Helpdesk - Schema Supabase (v4)
-- Rode este SQL no SQL Editor do Supabase.
-- Idempotente: pode rodar várias vezes sem quebrar nada.

create extension if not exists "pgcrypto";
create sequence if not exists public.tickets_numero_seq;

create table if not exists public.tickets (
  id              uuid primary key default gen_random_uuid(),
  numero_ticket   text unique,
  email_cliente   text not null,
  nome_cliente    text,
  titulo          text not null,
  descricao       text,
  categoria       text check (categoria is null or categoria in (
                    'bug','duvida','problema_tecnico','customizacao','sugestao','outro')),
  prioridade      text check (prioridade is null or prioridade in (
                    'baixa','media','alta','urgente')),
  status          text not null default 'novo' check (status in (
                    'novo','em_analise','em_andamento','aguardando','solucionado','fechado')),
  sla_deadline    timestamptz,
  location_id     text,
  location_name   text,
  anexo_url       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

alter table public.tickets add column if not exists numero_ticket text unique;
alter table public.tickets add column if not exists categoria     text;
alter table public.tickets add column if not exists prioridade    text;
alter table public.tickets add column if not exists sla_deadline  timestamptz;
alter table public.tickets add column if not exists location_id   text;
alter table public.tickets add column if not exists location_name text;
alter table public.tickets add column if not exists anexo_url     text;

alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets add constraint tickets_status_check
  check (status in ('novo','em_analise','em_andamento','aguardando','solucionado','fechado'));

alter table public.tickets drop constraint if exists tickets_categoria_check;
alter table public.tickets add constraint tickets_categoria_check
  check (categoria is null or categoria in ('bug','duvida','problema_tecnico','customizacao','sugestao','outro'));

alter table public.tickets drop constraint if exists tickets_prioridade_check;
alter table public.tickets add constraint tickets_prioridade_check
  check (prioridade is null or prioridade in ('baixa','media','alta','urgente'));

create index if not exists tickets_email_idx      on public.tickets (email_cliente);
create index if not exists tickets_status_idx     on public.tickets (status);
create index if not exists tickets_created_idx    on public.tickets (created_at desc);
create index if not exists tickets_numero_idx     on public.tickets (numero_ticket);
create index if not exists tickets_categoria_idx  on public.tickets (categoria);
create index if not exists tickets_prioridade_idx on public.tickets (prioridade);
create index if not exists tickets_sla_idx        on public.tickets (sla_deadline);
create index if not exists tickets_location_idx   on public.tickets (location_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_tickets_updated_at on public.tickets;
create trigger trg_tickets_updated_at
before update on public.tickets
for each row execute function public.set_updated_at();

create or replace function public.set_ticket_defaults()
returns trigger language plpgsql as $$
declare v_seq bigint; v_year text; v_hours int;
begin
  if new.numero_ticket is null then
    v_seq  := nextval('public.tickets_numero_seq');
    v_year := to_char(coalesce(new.created_at, now()), 'YYYY');
    new.numero_ticket := 'TK-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  end if;
  if new.sla_deadline is null then
    v_hours := case coalesce(new.prioridade, 'media')
      when 'urgente' then 4  when 'alta' then 24
      when 'media'   then 72 when 'baixa' then 168 else 72 end;
    new.sla_deadline := coalesce(new.created_at, now()) + (v_hours || ' hours')::interval;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tickets_defaults on public.tickets;
create trigger trg_tickets_defaults
before insert on public.tickets
for each row execute function public.set_ticket_defaults();

alter table public.tickets enable row level security;

drop policy if exists "tickets_anon_all" on public.tickets;
create policy "tickets_anon_all" on public.tickets
  for all to anon using (true) with check (true);

drop policy if exists "tickets_authenticated_all" on public.tickets;
create policy "tickets_authenticated_all" on public.tickets
  for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('ticket-anexos', 'ticket-anexos', true)
on conflict (id) do update set public = true;

drop policy if exists "ticket_anexos_anon_insert" on storage.objects;
create policy "ticket_anexos_anon_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'ticket-anexos');

drop policy if exists "ticket_anexos_public_select" on storage.objects;
create policy "ticket_anexos_public_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'ticket-anexos');
`

const MIGRATION_SQL = `-- Função RPC chamada pelo workflow Ticket Stage Sync do GHL.
-- Idempotente.

create or replace function public.update_ticket_status(
  p_numero text,
  p_status text
)
returns table (id uuid, numero_ticket text, status text)
language plpgsql security definer
set search_path = public
as $$
begin
  if p_status not in (
    'novo','em_analise','em_andamento','aguardando','solucionado','fechado'
  ) then
    raise exception 'status invalido: %', p_status;
  end if;
  return query
    update public.tickets t
       set status = p_status
     where t.numero_ticket = p_numero
    returning t.id, t.numero_ticket, t.status;
end;
$$;

grant execute on function public.update_ticket_status(text, text) to anon, authenticated;
`

// -------- helpers --------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

// -------- componentes auxiliares --------
function CopyBox({ label, value, language, rows = 1 }) {
  const [copied, setCopied] = useState(false)

  async function doCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const isMulti = rows > 1 || (value && value.includes('\n'))

  return (
    <div className="my-3">
      {label && (
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </div>
      )}
      <div className="relative rounded-md border border-gray-200 bg-gray-50">
        <pre
          className={`overflow-auto p-3 pr-20 text-xs text-gray-800 ${
            isMulti ? 'max-h-72' : ''
          }`}
        >
          <code>{value || '—'}</code>
        </pre>
        <button
          type="button"
          onClick={doCopy}
          disabled={!value}
          className="absolute right-2 top-2 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-100 disabled:opacity-50"
        >
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', help }) {
  return (
    <label className="block my-3">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {help && <p className="mt-1 text-xs text-gray-500">{help}</p>}
    </label>
  )
}

function Checklist({ items }) {
  return (
    <ul className="my-3 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
          <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
            {i + 1}
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

function ExternalLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-indigo-600 underline hover:text-indigo-800"
    >
      {children}
    </a>
  )
}

function StepHeader({ index, title, subtitle }) {
  return (
    <div className="mb-4 border-b border-gray-200 pb-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
        Passo {index + 1} de {STEPS.length}
      </div>
      <h2 className="mt-1 text-xl font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
  )
}

// =============================================================
// Página principal
// =============================================================
export default function Setup() {
  const [state, setState]   = useState(loadState)
  const [current, setCurrent] = useState(state.current || 0)

  useEffect(() => {
    saveState({ ...state, current })
  }, [state, current])

  function update(patch) {
    setState((s) => ({ ...s, ...patch }))
  }

  function reset() {
    if (!confirm('Zerar todo o progresso e inputs do wizard?')) return
    localStorage.removeItem(STORAGE_KEY)
    setState({})
    setCurrent(0)
  }

  const supabaseUrl = (state.supabaseUrl || '').trim().replace(/\/$/, '')
  const anonKey     = (state.anonKey     || '').trim()
  const appUrl      = (state.appUrl      || '').trim().replace(/\/$/, '')

  // Valores computados usados em vários passos
  const rpcUrl = supabaseUrl
    ? `${supabaseUrl}/rest/v1/rpc/update_ticket_status`
    : 'https://SEU_PROJETO.supabase.co/rest/v1/rpc/update_ticket_status'

  const clienteUrlExample = appUrl
    ? `${appUrl}/cliente/novo?location_id={{location.id}}&location_name={{location.name}}&email={{user.email}}&nome={{user.name}}`
    : 'https://SEU_APP.vercel.app/cliente/novo?location_id={{location.id}}&location_name={{location.name}}&email={{user.email}}&nome={{user.name}}'

  const envFile = useMemo(
    () =>
      `VITE_SUPABASE_URL=${supabaseUrl || 'https://SEU_PROJETO.supabase.co'}
VITE_SUPABASE_ANON_KEY=${anonKey || 'sua-publishable-key-aqui'}`,
    [supabaseUrl, anonKey],
  )

  const stepId = STEPS[current]?.id

  return (
    <div className="min-h-full bg-gray-50 py-6">
      <div className="mx-auto max-w-4xl px-4">
        {/* Header */}
        <header className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Wizard de Configuração
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Passo a passo pra conectar Supabase + GHL ao seu Helpdesk.
              Seu progresso é salvo automaticamente neste navegador.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-500 underline hover:text-red-600"
          >
            Zerar progresso
          </button>
        </header>

        {/* Stepper */}
        <nav className="mb-6 rounded-lg border border-gray-200 bg-white p-3">
          <ol className="flex flex-wrap gap-2">
            {STEPS.map((s, i) => {
              const done   = i < current
              const active = i === current
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setCurrent(i)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                      active
                        ? 'bg-indigo-600 text-white ring-indigo-600'
                        : done
                        ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                        : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {done ? '✓ ' : ''}
                    {i + 1}. {s.short}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        {/* Step content */}
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {stepId === 'welcome' && <StepWelcome index={current} />}

          {stepId === 'supabase' && (
            <StepSupabase
              index={current}
              state={state}
              update={update}
            />
          )}

          {stepId === 'deploy' && (
            <StepDeploy
              index={current}
              envFile={envFile}
              state={state}
              update={update}
            />
          )}

          {stepId === 'pipeline' && <StepPipeline index={current} />}

          {stepId === 'fields' && <StepFields index={current} />}

          {stepId === 'inbound' && (
            <StepInbound
              index={current}
              appUrl={appUrl}
              clienteUrlExample={clienteUrlExample}
            />
          )}

          {stepId === 'sync' && (
            <StepSync
              index={current}
              rpcUrl={rpcUrl}
              anonKey={anonKey}
            />
          )}

          {stepId === 'test' && (
            <StepTest index={current} appUrl={appUrl} />
          )}

          {stepId === 'done' && <StepDone index={current} />}
        </section>

        {/* Nav */}
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            disabled={current === 0}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-xs text-gray-400">
            {current + 1} / {STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => setCurrent((c) => Math.min(STEPS.length - 1, c + 1))}
            disabled={current === STEPS.length - 1}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
          >
            Próximo →
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================
// Passos
// =============================================================

function StepWelcome({ index }) {
  return (
    <>
      <StepHeader
        index={index}
        title="Bem-vindo ao Helpdesk"
        subtitle="Um sistema simples de tickets integrado com GoHighLevel."
      />
      <div className="prose prose-sm max-w-none text-gray-700">
        <p>
          Esse wizard te leva do zero até o Helpdesk funcionando 100% dentro
          da agência. A configuração tem 3 partes:
        </p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>
            <strong>Supabase</strong> — banco de dados + storage de imagens.
          </li>
          <li>
            <strong>Deploy do app</strong> — React na Vercel (ou qualquer host).
          </li>
          <li>
            <strong>GoHighLevel</strong> — pipeline, custom field e dois
            workflows (um recebe tickets, outro sincroniza status).
          </li>
        </ol>
        <p>
          Tempo estimado: <strong>30 a 45 minutos</strong>. Seu progresso é
          salvo automaticamente, pode pausar e voltar depois.
        </p>
        <p>
          <strong>Antes de começar, tem que ter:</strong>
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            Conta no <ExternalLink href="https://supabase.com">Supabase</ExternalLink>{' '}
            (free plan serve)
          </li>
          <li>
            Conta no <ExternalLink href="https://vercel.com">Vercel</ExternalLink> (ou
            outro host Node)
          </li>
          <li>
            Conta no <ExternalLink href="https://www.gohighlevel.com">GoHighLevel</ExternalLink>{' '}
            com acesso à agency (ou uma subconta)
          </li>
        </ul>
      </div>
    </>
  )
}

function StepSupabase({ index, state, update }) {
  return (
    <>
      <StepHeader
        index={index}
        title="1) Supabase — criar projeto e rodar SQL"
        subtitle="Cria o projeto, roda o schema e a função RPC que o GHL vai chamar."
      />

      <Checklist
        items={[
          <>
            Entra no <ExternalLink href="https://supabase.com">Supabase</ExternalLink>{' '}
            e clica em <em>New Project</em>. Escolhe um nome (ex:{' '}
            <code>helpdesk</code>), region <em>South America (São Paulo)</em>{' '}
            e define uma senha pro banco.
          </>,
          <>
            Espera ~2 min enquanto o projeto provisiona.
          </>,
          <>
            Copia a <strong>Project URL</strong> e a <strong>publishable key</strong>{' '}
            em <em>Project Settings → API Keys</em> e cola nos campos abaixo.
          </>,
          <>
            Abre o <em>SQL Editor</em>, cola o <strong>Schema SQL</strong> e
            clica em <em>Run</em>. Depois repete com o <strong>Migration SQL</strong>.
          </>,
        ]}
      />

      <Field
        label="Project URL"
        value={state.supabaseUrl}
        onChange={(v) => update({ supabaseUrl: v })}
        placeholder="https://xxxxxxxx.supabase.co"
        help="Copia exatamente como aparece no dashboard do Supabase."
      />

      <Field
        label="Publishable key (anon)"
        value={state.anonKey}
        onChange={(v) => update({ anonKey: v })}
        placeholder="sb_publishable_..."
        help="A chave pública. NÃO use a secret / service_role."
      />

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-gray-800">Schema SQL (1º)</h3>
        <p className="text-xs text-gray-500">
          Cola no SQL Editor e roda. Cria tabela <code>tickets</code>, storage
          bucket, triggers e policies.
        </p>
        <CopyBox value={SCHEMA_SQL} rows={20} />
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-gray-800">Migration SQL (2º)</h3>
        <p className="text-xs text-gray-500">
          Cola em outra aba do SQL Editor e roda. Cria a função
          <code> update_ticket_status</code> usada pelo workflow Ticket Stage Sync.
        </p>
        <CopyBox value={MIGRATION_SQL} rows={10} />
      </div>
    </>
  )
}

function StepDeploy({ index, envFile, state, update }) {
  return (
    <>
      <StepHeader
        index={index}
        title="2) Deploy do app"
        subtitle="Colocar o React no ar (Vercel é o caminho mais rápido)."
      />

      <Checklist
        items={[
          <>
            Faz um <em>fork</em> (ou clone) do repositório do Helpdesk.
          </>,
          <>
            Entra na <ExternalLink href="https://vercel.com/new">Vercel</ExternalLink>,
            importa o repositório e avança até a tela de <em>Environment Variables</em>.
          </>,
          <>
            Cola as duas variáveis abaixo (já preenchidas com os dados do
            passo anterior).
          </>,
          <>
            Clica em <em>Deploy</em>. Em ~1 min a app está no ar.
          </>,
          <>
            Copia a URL final (algo tipo <code>https://seu-app.vercel.app</code>) e
            cola no campo abaixo.
          </>,
        ]}
      />

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-gray-800">
          Environment Variables
        </h3>
        <CopyBox value={envFile} rows={2} />
      </div>

      <Field
        label="URL do seu app"
        value={state.appUrl}
        onChange={(v) => update({ appUrl: v })}
        placeholder="https://seu-app.vercel.app"
        help="Sem barra no final. Usado nos próximos passos."
      />
    </>
  )
}

function StepPipeline({ index }) {
  return (
    <>
      <StepHeader
        index={index}
        title="3) Pipeline no GHL"
        subtitle="Cria o pipeline CS com 6 stages espelhando os status dos tickets."
      />

      <Checklist
        items={[
          <>
            No GHL → <em>Opportunities → Pipelines</em> (ou{' '}
            <em>Settings → Pipelines</em>).
          </>,
          <>
            Clica em <em>+ Create New Pipeline</em>. Nome:{' '}
            <code>CS</code> (ou o que preferir — mas vai precisar ajustar
            referências nos workflows se mudar).
          </>,
          <>
            Cria 6 stages exatamente nessa ordem e com esses nomes:
          </>,
        ]}
      />

      <div className="my-3 rounded-md border border-gray-200 bg-gray-50 p-3">
        <ol className="list-decimal space-y-1 pl-6 text-sm text-gray-700">
          <li><strong>Novo</strong></li>
          <li><strong>Em Análise</strong></li>
          <li><strong>Em Andamento</strong></li>
          <li><strong>Aguardando</strong></li>
          <li><strong>Solucionado</strong></li>
          <li><strong>Fechado</strong></li>
        </ol>
      </div>

      <p className="text-sm text-gray-600">
        <strong>Save</strong>. O nome exato importa — as condições dos
        workflows batem contra esses nomes literalmente.
      </p>
    </>
  )
}

function StepFields({ index }) {
  return (
    <>
      <StepHeader
        index={index}
        title="4) Custom Fields na Opportunity"
        subtitle="Criar os campos que os workflows vão popular e ler."
      />

      <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
        <strong>Importante:</strong> esses campos TÊM que ser criados no
        objeto <strong>Opportunity</strong> — não em Contact. No Contact o
        valor seria sobrescrito a cada novo ticket do mesmo cliente.
      </div>

      <h3 className="mt-2 text-sm font-semibold text-gray-800">
        Campo 1: Numero Ticket
      </h3>
      <Checklist
        items={[
          <>
            <em>Settings → Custom Fields → + Add Custom Field</em>
          </>,
          <>
            <strong>Name:</strong> <code>Numero Ticket</code>
          </>,
          <>
            <strong>Field Type:</strong> <code>Single line</code>
          </>,
          <>
            <strong>Add to object:</strong>{' '}
            <code>Opportunity</code> <em>(muito importante)</em>
          </>,
          <>
            <strong>Save</strong>. O Key gerado fica{' '}
            <code>numero_ticket</code>.
          </>,
        ]}
      />

      <h3 className="mt-6 text-sm font-semibold text-gray-800">
        Campo 2: Categoria (opcional, mas recomendado)
      </h3>
      <p className="text-xs text-gray-500">
        Mesmo processo. Usado só pra mostrar a categoria no card do pipeline —
        a condição de roteamento lê direto do webhook, não deste campo.
      </p>
      <Checklist
        items={[
          <>
            <strong>Name:</strong> <code>Categoria</code>
          </>,
          <>
            <strong>Field Type:</strong> <code>Single line</code>
          </>,
          <>
            <strong>Add to object:</strong> <code>Opportunity</code>
          </>,
          <>
            Save. Key: <code>categoria</code>.
          </>,
        ]}
      />
    </>
  )
}

function StepInbound({ index, appUrl, clienteUrlExample }) {
  return (
    <>
      <StepHeader
        index={index}
        title="5) Workflow Inbound Ticklet"
        subtitle="Recebe o webhook do Supabase e cria Contact + Opportunity."
      />

      <h3 className="text-sm font-semibold text-gray-800">5.1 — Criar workflow</h3>
      <Checklist
        items={[
          <>
            GHL → <em>Automation → Workflows → + Create Workflow → Start from Scratch</em>.
          </>,
          <>
            Nome: <code>Inbound Ticklet</code>.
          </>,
          <>
            <em>Add New Trigger → Inbound Webhook</em>. Em <em>Trigger Name</em>{' '}
            coloca <code>New ticket</code>. <strong>Save</strong>.
          </>,
          <>
            Depois de salvar, o GHL gera uma <strong>Webhook URL</strong> —
            copia, você vai colar no Supabase Database Webhook logo abaixo.
          </>,
        ]}
      />

      <h3 className="mt-6 text-sm font-semibold text-gray-800">
        5.2 — Conectar Supabase → GHL (Database Webhook)
      </h3>
      <Checklist
        items={[
          <>
            Supabase → <em>Database → Webhooks → + Create a new hook</em>.
          </>,
          <>
            Name: <code>new_ticket_to_ghl</code>. Table: <code>tickets</code>.
            Events: só <code>INSERT</code>. Type: <code>HTTP Request</code>.
            Method: <code>POST</code>.
          </>,
          <>
            HTTP URL: cola a Webhook URL que o GHL gerou no passo 5.1.
          </>,
          <>
            HTTP Headers: adiciona <code>Content-Type: application/json</code>.
          </>,
          <>
            <strong>Create webhook</strong>.
          </>,
        ]}
      />

      <h3 className="mt-6 text-sm font-semibold text-gray-800">
        5.3 — Capturar sample no trigger
      </h3>
      <Checklist
        items={[
          <>
            Volta no GHL → Trigger Inbound Webhook → clica em{' '}
            <em>Listen for new request</em> (ou Recapture).
          </>,
          <>
            Abre outra aba em {appUrl ? (
              <ExternalLink href={`${appUrl}/cliente/novo?email=teste@teste.com`}>
                {appUrl}/cliente/novo?email=teste@teste.com
              </ExternalLink>
            ) : (
              <code>SEU_APP/cliente/novo?email=teste@teste.com</code>
            )}{' '}
            e cria um ticket fake. O GHL vai capturar o payload.
          </>,
          <>
            Confere se o payload tem o campo <code>record</code> com os
            valores do ticket.
          </>,
        ]}
      />

      <h3 className="mt-6 text-sm font-semibold text-gray-800">
        5.4 — Ações do workflow
      </h3>
      <p className="text-sm text-gray-600">
        Adiciona as ações abaixo, em ordem, usando os merge tags indicados.
      </p>

      <div className="my-3 rounded-md border border-gray-200 bg-gray-50 p-4 space-y-4 text-sm text-gray-700">
        <div>
          <strong>Action 1: Create / Update Contact</strong>
          <ul className="mt-1 list-disc pl-6 text-xs">
            <li>Email: <code>{'{{inboundWebhookRequest.record.email_cliente}}'}</code></li>
            <li>First Name: <code>{'{{inboundWebhookRequest.record.nome_cliente}}'}</code></li>
          </ul>
        </div>

        <div>
          <strong>Action 2: Create Opportunity</strong>
          <ul className="mt-1 list-disc pl-6 text-xs">
            <li>Pipeline: <code>CS</code> · Stage: <code>Novo</code></li>
            <li>
              Opportunity Name:{' '}
              <code>
                {'[{{inboundWebhookRequest.record.numero_ticket}}] {{inboundWebhookRequest.record.location_name}} — {{inboundWebhookRequest.record.nome_cliente}}'}
              </code>
            </li>
            <li>Numero Ticket: <code>{'{{inboundWebhookRequest.record.numero_ticket}}'}</code></li>
            <li>Categoria: <code>{'{{inboundWebhookRequest.record.categoria}}'}</code></li>
          </ul>
        </div>

        <div>
          <strong>Action 3: Add Note</strong>
          <ul className="mt-1 list-disc pl-6 text-xs">
            <li>
              Note:
              <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 text-[11px] ring-1 ring-gray-200">
{`Ticket: {{inboundWebhookRequest.record.numero_ticket}}
Título: {{inboundWebhookRequest.record.titulo}}

{{inboundWebhookRequest.record.descricao}}

Anexo: {{inboundWebhookRequest.record.anexo_url}}`}
              </pre>
            </li>
          </ul>
        </div>

        <div>
          <strong>Action 4: If/Else por Categoria</strong>
          <p className="mt-1 text-xs">
            Campo: <code>Inbound Webhook Data → record.categoria</code>.
            Cria 1 branch por categoria (bug, duvida, problema_tecnico,
            customizacao, sugestao, outro) com <em>is</em> igual ao valor.
          </p>
        </div>

        <div>
          <strong>Action 5 (por branch): Assign + Notify</strong>
          <p className="mt-1 text-xs">
            Em cada branch adiciona <em>Assign Opportunity User</em>{' '}
            apontando pro responsável pela categoria. Depois adiciona{' '}
            <em>Send Internal Notification</em> (e/ou email) com:
          </p>
          <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 text-[11px] ring-1 ring-gray-200">
{`Título: Novo Ticket: {{inboundWebhookRequest.record.numero_ticket}}

Mensagem:
Número: {{inboundWebhookRequest.record.numero_ticket}}
Cliente: {{inboundWebhookRequest.record.email_cliente}}
Subconta: {{inboundWebhookRequest.record.location_name}}
Categoria: {{inboundWebhookRequest.record.categoria}}
Assunto: {{inboundWebhookRequest.record.titulo}}`}
          </pre>
        </div>
      </div>

      <p className="text-sm text-gray-600">
        <strong>Save</strong> cada ação → <strong>Save</strong> o workflow →{' '}
        <strong>Publish</strong>.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-gray-800">
        5.5 — Link do Helpdesk no GHL (Custom Menu / Iframe)
      </h3>
      <p className="text-sm text-gray-600">
        Pra subcontas abrirem a página de tickets do próprio Helpdesk, usa
        essa URL (propaga location_id, location_name, email e nome):
      </p>
      <CopyBox value={clienteUrlExample} />
    </>
  )
}

function StepSync({ index, rpcUrl, anonKey }) {
  const bodyTemplate = (status) =>
    `{\n  "p_numero": "{{opportunity.numero_ticket}}",\n  "p_status": "${status}"\n}`

  return (
    <>
      <StepHeader
        index={index}
        title="6) Workflow Ticket Stage Sync"
        subtitle="Quando arrasta a Opportunity no pipeline, atualiza o ticket no Supabase."
      />

      <Checklist
        items={[
          <>
            GHL → <em>Automation → Workflows → + Create Workflow → Start from Scratch</em>.
          </>,
          <>
            Nome: <code>Ticket Stage Sync</code>.
          </>,
          <>
            <em>Add New Trigger → Pipeline Stage Changed</em>. Pipeline:{' '}
            <code>CS</code>. Deixa <em>Move to stage</em> em branco (dispara
            em qualquer mudança).
          </>,
          <>
            <em>+ Add Action → If/Else</em> com 6 branches. Em cada um:{' '}
            <code>Opportunity → Current stage → is → &lt;nome do stage&gt;</code>.
          </>,
          <>
            Em cada branch, adiciona uma ação <em>Custom Webhook</em> com a
            config abaixo.
          </>,
          <>
            <strong>Save</strong> cada ação → <strong>Save</strong> o workflow →{' '}
            <strong>Publish</strong>.
          </>,
        ]}
      />

      <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
        <h3 className="mb-2 font-semibold text-gray-800">
          Configuração do Custom Webhook (mesma em todas as branches)
        </h3>

        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold uppercase text-gray-500">Method</div>
            <CopyBox value="POST" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-gray-500">URL</div>
            <CopyBox value={rpcUrl} />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-gray-500">
              Headers (Key → Value)
            </div>
            <CopyBox
              value={`apikey\n${anonKey || 'SUA_PUBLISHABLE_KEY'}\n\nAuthorization\nBearer ${anonKey || 'SUA_PUBLISHABLE_KEY'}`}
              rows={4}
            />
            <p className="mt-1 text-xs text-gray-500">
              ⚠ <strong>Key do header</strong> é só a palavra (<code>apikey</code>,
              <code> Authorization</code>) — sem <code>:</code> no final.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-gray-500">
              Content-Type
            </div>
            <CopyBox value="application/json" />
          </div>
        </div>

        <h3 className="mt-5 mb-2 font-semibold text-gray-800">
          Raw Body (muda por branch — só troca o <code>p_status</code>)
        </h3>

        {['novo','em_analise','em_andamento','aguardando','solucionado','fechado'].map((s) => (
          <div key={s} className="mb-2">
            <div className="text-xs font-semibold uppercase text-gray-500">
              Branch: {s}
            </div>
            <CopyBox value={bodyTemplate(s)} rows={3} />
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm text-gray-600">
        <strong>Dica:</strong> configura o Custom Webhook em <em>uma</em>{' '}
        branch, depois duplica a ação nas outras 5 e troca só o{' '}
        <code>p_status</code> no body.
      </p>
    </>
  )
}

function StepTest({ index, appUrl }) {
  const exampleUrl = appUrl
    ? `${appUrl}/cliente/novo?email=teste@exemplo.com&nome=Teste`
    : 'https://SEU_APP.vercel.app/cliente/novo?email=teste@exemplo.com&nome=Teste'

  return (
    <>
      <StepHeader
        index={index}
        title="7) Testar de ponta a ponta"
        subtitle="Agora confirma que tudo flui: ticket → pipeline → sync."
      />

      <Checklist
        items={[
          <>
            Abre o app em:
          </>,
        ]}
      />
      <CopyBox value={exampleUrl} />

      <Checklist
        items={[
          <>
            Clica em <em>Novo Ticket</em>, preenche título + descrição,
            escolhe categoria <code>bug</code> e (opcional) anexa uma imagem.
            Envia.
          </>,
          <>
            Volta pra /admin e confirma que o ticket apareceu com status{' '}
            <code>Novo</code>.
          </>,
          <>
            Vai no GHL → <em>Opportunities</em>. Deve ter uma Opportunity no
            stage <code>Novo</code> com o número do ticket no título.
          </>,
          <>
            Confere que o usuário configurado pra categoria <code>bug</code>{' '}
            recebeu a notificação (sininho ou email).
          </>,
          <>
            Arrasta a Opportunity pro stage <code>Em Andamento</code>.
          </>,
          <>
            Em 1-2 segundos, o ticket no dashboard muda pra{' '}
            <code>Em andamento</code> (via Supabase Realtime).
          </>,
          <>
            Arrasta pra outros stages pra validar cada branch do Ticket Stage Sync.
          </>,
        ]}
      />

      <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <strong>Alguma etapa falhou?</strong> Abre o workflow correspondente
        em <em>Execution Logs</em> e clica em <em>View Details</em> na ação que
        deu erro. Os dois erros mais comuns são:
        <ul className="mt-1 list-disc pl-5">
          <li>
            <strong>401/403 no Stage Sync:</strong> anon key errada ou faltando
            em um dos headers.
          </li>
          <li>
            <strong>200/204 mas nada mudou:</strong> Opportunity antiga, sem
            o custom field <code>Numero Ticket</code> preenchido — cria um
            ticket novo pra testar.
          </li>
        </ul>
      </div>
    </>
  )
}

function StepDone({ index }) {
  return (
    <>
      <StepHeader
        index={index}
        title="✓ Pronto!"
        subtitle="Helpdesk configurado."
      />
      <div className="prose prose-sm max-w-none text-gray-700">
        <p>
          Se chegou até aqui e os testes passaram, tá tudo rodando. Alguns
          próximos passos opcionais:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Integrar no GHL como Custom Menu / Iframe</strong> — usa a
            URL do passo 5.5 pra dar acesso aos clientes dentro da subconta.
          </li>
          <li>
            <strong>Customizar as categorias</strong> — edita{' '}
            <code>src/lib/supabase.js</code> (<code>CATEGORIA_OPTIONS</code>)
            e ajusta o CHECK constraint no banco.
          </li>
          <li>
            <strong>Segurança</strong> — em produção com muito volume, valer
            trocar a <em>publishable key</em> no Stage Sync por um header
            secreto e uma Edge Function que valida o token.
          </li>
        </ul>
        <p className="mt-4">
          Se precisar reconfigurar do zero, é só clicar em{' '}
          <em>Zerar progresso</em> lá em cima.
        </p>
      </div>
    </>
  )
}
