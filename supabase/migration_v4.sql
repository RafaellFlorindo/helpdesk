-- migration_v4.sql
-- Adiciona suporte a anexo (imagem opcional) nos tickets.
-- Idempotente: pode rodar várias vezes sem efeito colateral.

alter table public.tickets
  add column if not exists anexo_url text;

comment on column public.tickets.anexo_url is
  'URL pública (Supabase Storage) da imagem anexada no momento de abrir o ticket. NULL quando não houver anexo.';
