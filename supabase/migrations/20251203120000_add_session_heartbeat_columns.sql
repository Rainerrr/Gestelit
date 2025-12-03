-- Add heartbeat tracking fields to sessions
alter table public.sessions
  add column if not exists last_seen_at timestamptz not null default timezone('utc', now()),
  add column if not exists forced_closed_at timestamptz null;


