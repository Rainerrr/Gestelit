-- Mirror latest status on sessions for realtime dashboards
alter table public.sessions
  add column if not exists current_status status_event_state not null default 'setup',
  add column if not exists last_status_change_at timestamptz not null default timezone('utc', now());

