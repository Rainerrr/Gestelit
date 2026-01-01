-- Add stoppage flag to status definitions for KPI calculations
alter table public.status_definitions
  add column if not exists is_stoppage boolean not null default false;

update public.status_definitions
set is_stoppage = true
where code in ('stopped', 'fault', 'waiting_client', 'plate_change');













