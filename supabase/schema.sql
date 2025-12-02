create extension if not exists "pgcrypto";

-- Enums
create type worker_role as enum ('worker', 'admin');
create type station_type as enum (
  'prepress',
  'digital_press',
  'offset',
  'folding',
  'cutting',
  'binding',
  'shrink',
  'lamination',
  'other'
);
create type session_status as enum ('active', 'completed', 'aborted');
create type checklist_kind as enum ('start', 'end');
create type reason_type as enum ('stop', 'scrap');
create type status_event_state as enum (
  'setup',
  'production',
  'stopped',
  'fault',
  'waiting_client',
  'plate_change'
);

-- Workers
create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  worker_code text not null unique,
  full_name text not null,
  language text check (language in ('he', 'ru', 'auto')) default 'auto',
  role worker_role not null default 'worker',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stations
create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  station_type station_type not null default 'other',
  is_active boolean not null default true,
  start_checklist jsonb not null default '[]'::jsonb,
  end_checklist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Worker to station assignments
create table if not exists worker_stations (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  station_id uuid not null references stations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (worker_id, station_id)
);

-- Jobs
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  customer_name text,
  description text,
  planned_quantity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sessions
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id),
  station_id uuid not null references stations(id),
  job_id uuid not null references jobs(id),
  status session_status not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_good integer not null default 0,
  total_scrap integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_worker_idx on sessions(worker_id);
create index if not exists sessions_station_idx on sessions(station_id);
create index if not exists sessions_status_idx on sessions(status);

-- Reasons
create table if not exists reasons (
  id uuid primary key default gen_random_uuid(),
  type reason_type not null,
  label_he text not null,
  label_ru text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reasons_type_idx on reasons(type);

-- Status events
create table if not exists status_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  status status_event_state not null,
  reason_id uuid references reasons(id),
  note text,
  image_url text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists status_events_session_idx on status_events(session_id);
create index if not exists status_events_status_idx on status_events(status);

-- Checklist responses
create table if not exists checklist_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  station_id uuid not null references stations(id) on delete cascade,
  kind checklist_kind not null,
  item_id text not null,
  value_bool boolean,
  value_text text,
  created_at timestamptz not null default now()
);

create index if not exists checklist_responses_session_idx
  on checklist_responses(session_id);

create index if not exists checklist_responses_station_kind_idx
  on checklist_responses(station_id, kind);

