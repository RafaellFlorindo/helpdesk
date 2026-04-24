-- migration_v6.sql
-- RPC function usada pelo workflow "Ticket Stage Sync" do GHL.
-- O Custom Webhook do GHL não suporta PATCH, então em vez de chamar
-- PATCH /rest/v1/tickets, a gente chama POST /rest/v1/rpc/update_ticket_status
-- passando numero_ticket e o novo status no body.
--
-- Idempotente: pode rodar de novo sem quebrar nada.

create or replace function public.update_ticket_status(
  p_numero text,
  p_status text
)
returns table (
  id             uuid,
  numero_ticket  text,
  status         text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Valida o status contra os 6 aceitos (mesma lista do CHECK na tabela)
  if p_status not in (
    'novo', 'em_analise', 'em_andamento',
    'aguardando', 'solucionado', 'fechado'
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

-- Permite que a anon key chame essa função via REST
grant execute on function public.update_ticket_status(text, text) to anon, authenticated;
