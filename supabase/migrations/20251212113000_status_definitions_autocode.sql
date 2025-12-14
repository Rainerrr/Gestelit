-- Auto-generate status codes; keep existing rows safe
alter table public.status_definitions
  alter column code set default gen_random_uuid()::text;

update public.status_definitions
set code = gen_random_uuid()::text
where (code is null or length(trim(code)) = 0);

-- order preference: global uses sort_order, station-specific by created_at
create index if not exists status_definitions_created_idx
  on public.status_definitions(created_at);


