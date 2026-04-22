-- =============================================================
-- Helpdesk - Schema Supabase (v2)
-- Rode este SQL no SQL Editor do Supabase.
-- Idempotente: pode rodar várias vezes sem quebrar nada.
-- =============================================================

-- 1) Extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- 2) Sequência usada para numerar tickets (TK-AAAA-NNNN)
create sequence if not exists public.tickets_numero_seq;

-- 3) Tabela principal de tickets
create table if not exists public.tickets (
  id              uuid primary key default gen_random_uuid(),
  numero_ticket   text unique,
  email_cliente   text not null,
  nome_cliente    text,
  titulo          text not null,
  descricao       text,
  categoria       text
                   check (categoria is null or categoria in (
                     'bug',
                     'duvida',
                     'problema_tecnico',
                     'customizacao',
                     'sugestao',
                     'outro'
                   )),
  prioridade      text
                   check (prioridade is null or prioridade in (
                     'baixa',
                     'media',
                     'alta',
                     'urgente'
                   )),
  status          text not null default 'novo'
                   check (status in (
                     'novo',
                     'em_analise',
                     'em_andamento',
                     'aguardando',
                     'solucionado',
                     'fechado'
                   )),
  sla_deadline    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- Se a tabela já existia em versão antiga, garante que as colunas novas existam
alter table public.tickets add column if not exists numero_ticket text unique;
alter table public.tickets add column if not exists categoria     text;
alter table public.tickets add column if not exists prioridade    text;
alter table public.tickets add column if not exists sla_deadline  timestamptz;

-- Reaplica os CHECKs para cobrir tabelas antigas
alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets add constraint tickets_status_check
  check (status in ('novo','em_analise','em_andamento','aguardando','solucionado','fechado'));

alter table public.tickets drop constraint if exists tickets_categoria_check;
alter table public.tickets add constraint tickets_categoria_check
  check (categoria is null or categoria in ('bug','duvida','problema_tecnico','customizacao','sugestao','outro'));

alter table public.tickets drop constraint if exists tickets_prioridade_check;
alter table public.tickets add constraint tickets_prioridade_check
  check (prioridade is null or prioridade in ('baixa','media','alta','urgente'));

-- 4) Índices úteis para busca e filtros
create index if not exists tickets_email_idx      on public.tickets (email_cliente);
create index if not exists tickets_status_idx     on public.tickets (status);
create index if not exists tickets_created_idx    on public.tickets (created_at desc);
create index if not exists tickets_numero_idx     on public.tickets (numero_ticket);
create index if not exists tickets_categoria_idx  on public.tickets (categoria);
create index if not exists tickets_prioridade_idx on public.tickets (prioridade);
create index if not exists tickets_sla_idx        on public.tickets (sla_deadline);

-- 5) Função / trigger: mantém updated_at sincronizado
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

-- 6) Função / trigger: antes do INSERT gera numero_ticket e sla_deadline
--    numero_ticket  -> TK-{ano}-{sequência de 4 dígitos}
--    sla_deadline   -> created_at + horas conforme prioridade
--                      urgente=4h, alta=24h, media=72h, baixa=168h
create or replace function public.set_ticket_defaults()
returns trigger
language plpgsql
as $$
declare
  v_seq   bigint;
  v_year  text;
  v_hours int;
begin
  if new.numero_ticket is null then
    v_seq  := nextval('public.tickets_numero_seq');
    v_year := to_char(coalesce(new.created_at, now()), 'YYYY');
    new.numero_ticket := 'TK-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  end if;

  if new.sla_deadline is null then
    v_hours := case coalesce(new.prioridade, 'media')
      when 'urgente' then 4
      when 'alta'    then 24
      when 'media'   then 72
      when 'baixa'   then 168
      else 72
    end;
    new.sla_deadline := coalesce(new.created_at, now()) + (v_hours || ' hours')::interval;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tickets_defaults on public.tickets;
create trigger trg_tickets_defaults
before insert on public.tickets
for each row execute function public.set_ticket_defaults();

-- 7) Backfill: preenche numero_ticket e sla_deadline para tickets antigos
do $$
declare
  r record;
  v_seq   bigint;
  v_year  text;
  v_hours int;
begin
  for r in
    select id, created_at, prioridade
    from public.tickets
    where numero_ticket is null
    order by created_at asc
  loop
    v_seq   := nextval('public.tickets_numero_seq');
    v_year  := to_char(coalesce(r.created_at, now()), 'YYYY');
    v_hours := case coalesce(r.prioridade, 'media')
      when 'urgente' then 4
      when 'alta'    then 24
      when 'media'   then 72
      when 'baixa'   then 168
      else 72
    end;

    update public.tickets
       set numero_ticket = 'TK-' || v_year || '-' || lpad(v_seq::text, 4, '0'),
           sla_deadline  = coalesce(sla_deadline,
                                     coalesce(created_at, now()) + (v_hours || ' hours')::interval)
     where id = r.id;
  end loop;
end;
$$;

-- 8) Row Level Security
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
