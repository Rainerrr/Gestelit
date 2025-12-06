-- Add snapshot columns for historical sessions
alter table public.sessions
  add column if not exists worker_full_name_snapshot text,
  add column if not exists worker_code_snapshot text,
  add column if not exists station_name_snapshot text,
  add column if not exists station_code_snapshot text;

-- Drop existing FKs to change delete behavior
alter table public.sessions drop constraint if exists sessions_worker_id_fkey;
alter table public.sessions drop constraint if exists sessions_station_id_fkey;

-- Allow nulls on worker/station for historical retention
alter table public.sessions alter column worker_id drop not null;
alter table public.sessions alter column station_id drop not null;

-- Recreate FKs with ON DELETE SET NULL
alter table public.sessions
  add constraint sessions_worker_id_fkey foreign key (worker_id)
    references public.workers(id) on delete set null;

alter table public.sessions
  add constraint sessions_station_id_fkey foreign key (station_id)
    references public.stations(id) on delete set null;

-- Backfill snapshots for existing sessions
update public.sessions s
set worker_full_name_snapshot = coalesce(s.worker_full_name_snapshot, w.full_name),
    worker_code_snapshot = coalesce(s.worker_code_snapshot, w.worker_code)
from public.workers w
where s.worker_id = w.id;

update public.sessions s
set station_name_snapshot = coalesce(s.station_name_snapshot, st.name),
    station_code_snapshot = coalesce(s.station_code_snapshot, st.code)
from public.stations st
where s.station_id = st.id;

