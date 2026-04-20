-- =============================================================
-- Helpdesk - Schema Supabase
-- Rode este SQL no SQL Editor do Supabase
-- =============================================================

-- 1) Extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- 2) Tabela principal de tickets
create table if not exists public.tickets (
  id              uuid primary key default gen_random_uuid(),
  email_cliente   text not null,
  nome_cliente    text,
  titulo          text not null,
  descricao       text,
  status          text not null default 'novo'
                   check (status in ('novo','em_analise','solucionado','fechado')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- 3) Índices úteis para busca e filtros
create index if not exists tickets_email_idx   on public.tickets (email_cliente);
create index if not exists tickets_status_idx  on public.tickets (status);
create index if not exists tickets_created_idx on public.tickets (created_at desc);

-- 4) Trigger para manter updated_at sincronizado
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tickets_updated_at on public.tickets;
create trigger trg_tickets_updated_at
before update on public.tickets
for each row execute function public.set_updated_at();

-- 5) Row Level Security
-- Como o app roda com a chave anon embedada no iframe do GHL, liberamos
-- acesso com a chave anon. Ajuste conforme sua política de segurança.
alter table public.tickets enable row level security;

drop policy if exists "tickets_anon_all" on public.tickets;
create policy "tickets_anon_all"
  on public.tickets
  for all
  to anon
  using (true)
  with check (true);

-- Também liberamos para usuários autenticados (se você usar auth no futuro)
drop policy if exists "tickets_authenticated_all" on public.tickets;
create policy "tickets_authenticated_all"
  on public.tickets
  for all
  to authenticated
  using (true)
  with check (true);
