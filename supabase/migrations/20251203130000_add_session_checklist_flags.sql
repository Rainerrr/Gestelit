-- Add checklist completion flags to sessions and remove checklist_responses table
begin;

-- Add start/end checklist completion flags on sessions
alter table public.sessions
  add column if not exists start_checklist_completed boolean not null default false,
  add column if not exists end_checklist_completed boolean not null default false;

-- Drop checklist_responses table (no longer needed)
drop table if exists public.checklist_responses cascade;

commit;


