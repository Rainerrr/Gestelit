-- Migrate status tracking to use status_definition.id and drop legacy columns.
-- Also constrain colors to the 15 allowed palette.

-- 1) Add new UUID columns for status references
alter table public.status_events
  add column if not exists status_definition_id uuid;

alter table public.sessions
  add column if not exists current_status_id uuid;

-- 2) Populate the new columns from existing code values before dropping them
update public.status_events se
set status_definition_id = sd.id
from public.status_definitions sd
where se.status_code = sd.code;

update public.sessions s
set current_status_id = sd.id
from public.status_definitions sd
where s.current_status_code = sd.code;

-- 3) Backfill any nulls to the 'setup' status (safe default)
do $$
declare
  setup_id uuid;
begin
  select id into setup_id from public.status_definitions where code = 'setup' limit 1;
  if setup_id is null then
    raise exception 'setup status missing; cannot backfill';
  end if;

  update public.status_events
  set status_definition_id = setup_id
  where status_definition_id is null;

  update public.sessions
  set current_status_id = setup_id
  where current_status_id is null;
end $$;

-- 4) Enforce NOT NULL and add FKs
alter table public.status_events
  alter column status_definition_id set not null,
  add constraint status_events_status_definition_id_fkey
    foreign key (status_definition_id) references public.status_definitions(id) on delete restrict;

alter table public.sessions
  alter column current_status_id set not null,
  add constraint sessions_current_status_id_fkey
    foreign key (current_status_id) references public.status_definitions(id) on delete restrict;

-- 5) Drop legacy code columns from events/sessions
alter table public.status_events
  drop column if exists status_code;

alter table public.sessions
  drop column if exists current_status_code;

-- 6) Normalize colors to the allowed palette before adding constraint
update public.status_definitions
set color_hex = '#94a3b8'
where color_hex not in (
  '#10b981', -- Emerald
  '#f59e0b', -- Amber
  '#f97316', -- Orange
  '#ef4444', -- Red
  '#3b82f6', -- Blue
  '#8b5cf6', -- Purple
  '#06b6d4', -- Cyan
  '#14b8a6', -- Teal
  '#84cc16', -- Lime
  '#eab308', -- Yellow
  '#ec4899', -- Pink
  '#6366f1', -- Indigo
  '#0ea5e9', -- Sky
  '#64748b', -- Slate
  '#94a3b8'  -- Slate-400 (default)
);

-- 7) Drop legacy columns from status_definitions
alter table public.status_definitions
  drop column if exists code,
  drop column if exists is_active,
  drop column if exists sort_order,
  drop column if exists is_stoppage;

-- 8) Constrain colors to the 15 allowed values
alter table public.status_definitions
  add constraint status_definitions_color_hex_allowed
    check (color_hex in (
      '#10b981',
      '#f59e0b',
      '#f97316',
      '#ef4444',
      '#3b82f6',
      '#8b5cf6',
      '#06b6d4',
      '#14b8a6',
      '#84cc16',
      '#eab308',
      '#ec4899',
      '#6366f1',
      '#0ea5e9',
      '#64748b',
      '#94a3b8'
    ));

-- 9) Ensure created_at default exists (safety)
alter table public.status_definitions
  alter column created_at set default timezone('utc', now());



