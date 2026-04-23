-- =============================================================
-- Helpdesk - Migração v3
-- Adiciona integração com subcontas (locations) do GoHighLevel:
--   - location_id   : ID da subconta (vem de {{location.id}} na GHL)
--   - location_name : Nome da subconta (vem de {{location.name}} na GHL)
--
-- Rode este SQL no SQL Editor do Supabase.
-- Seguro rodar várias vezes.
-- =============================================================

alter table public.tickets
  add column if not exists location_id   text,
  add column if not exists location_name text;

create index if not exists tickets_location_idx on public.tickets (location_id);
