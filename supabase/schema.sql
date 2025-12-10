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
  station_reasons jsonb not null default '[{"id":"general-malfunction","label_he":"תקלת כללית","label_ru":"Общая неисправность","is_active":true}]'::jsonb,
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
  start_checklist_completed boolean not null default false,
  end_checklist_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_worker_idx on sessions(worker_id);
create index if not exists sessions_station_idx on sessions(station_id);
create index if not exists sessions_status_idx on sessions(status);

-- Malfunctions
create table if not exists malfunctions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id),
  station_reason_id text,
  description text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists malfunctions_station_idx on malfunctions(station_id);

-- Status events
create table if not exists status_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  status status_event_state not null,
  station_reason_id text,
  note text,
  image_url text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists status_events_session_idx on status_events(session_id);
create index if not exists status_events_status_idx on status_events(status);

