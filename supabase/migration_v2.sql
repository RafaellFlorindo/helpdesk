-- =============================================================
-- Helpdesk - Migração v2
-- Adiciona: numero_ticket (TK-AAAA-NNNN), categoria, prioridade,
-- sla_deadline, e expande os status para 6 valores.
--
-- Rode este SQL no SQL Editor do Supabase.
-- É seguro rodar mais de uma vez (idempotente).
-- =============================================================

-- 1) Sequência usada para gerar o número incremental do ticket.
create sequence if not exists public.tickets_numero_seq;

-- 2) Novas colunas (se ainda não existirem)
alter table public.tickets
  add column if not exists numero_ticket text unique,
  add column if not exists categoria     text,
  add column if not exists prioridade    text,
  add column if not exists sla_deadline  timestamptz;

-- 3) Expandir o CHECK de status (remove o antigo e cria o novo)
alter table public.tickets
  drop constraint if exists tickets_status_check;

alter table public.tickets
  add constraint tickets_status_check
  check (status in (
    'novo',
    'em_analise',
    'em_andamento',
    'aguardando',
    'solucionado',
    'fechado'
  ));

-- 4) CHECK de categoria e prioridade
alter table public.tickets
  drop constraint if exists tickets_categoria_check;

alter table public.tickets
  add constraint tickets_categoria_check
  check (categoria is null or categoria in (
    'bug',
    'duvida',
    'problema_tecnico',
    'customizacao',
    'sugestao',
    'outro'
  ));

alter table public.tickets
  drop constraint if exists tickets_prioridade_check;

alter table public.tickets
  add constraint tickets_prioridade_check
  check (prioridade is null or prioridade in (
    'baixa',
    'media',
    'alta',
    'urgente'
  ));

-- 5) Função que gera o numero_ticket e o sla_deadline antes de inserir
create or replace function public.set_ticket_defaults()
returns trigger
language plpgsql
as $$
declare
  v_seq   bigint;
  v_year  text;
  v_hours int;
begin
  -- Numero do ticket
  if new.numero_ticket is null then
    v_seq  := nextval('public.tickets_numero_seq');
    v_year := to_char(coalesce(new.created_at, now()), 'YYYY');
    new.numero_ticket := 'TK-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  end if;

  -- SLA deadline baseado na prioridade
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

-- 6) Índices para os novos campos
create index if not exists tickets_numero_idx     on public.tickets (numero_ticket);
create index if not exists tickets_categoria_idx  on public.tickets (categoria);
create index if not exists tickets_prioridade_idx on public.tickets (prioridade);
create index if not exists tickets_sla_idx        on public.tickets (sla_deadline);

-- 7) Preenche numero_ticket / sla_deadline para os tickets antigos
--    (roda só nos que estão nulos)
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
    v_seq  := nextval('public.tickets_numero_seq');
    v_year := to_char(coalesce(r.created_at, now()), 'YYYY');
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
