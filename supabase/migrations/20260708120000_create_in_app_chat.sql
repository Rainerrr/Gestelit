create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'chat_thread_status') then
    create type chat_thread_status as enum ('open', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'chat_priority') then
    create type chat_priority as enum ('normal', 'urgent');
  end if;

  if not exists (select 1 from pg_type where typname = 'chat_sender_type') then
    create type chat_sender_type as enum ('admin', 'worker', 'system');
  end if;

  if not exists (select 1 from pg_type where typname = 'chat_message_kind') then
    create type chat_message_kind as enum ('text', 'system');
  end if;

  if not exists (select 1 from pg_type where typname = 'chat_reader_type') then
    create type chat_reader_type as enum ('admin', 'worker');
  end if;
end $$;

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id),
  session_id uuid references public.sessions(id) on delete set null,
  station_id uuid references public.stations(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  job_item_id uuid references public.job_items(id) on delete set null,
  job_item_step_id uuid references public.job_item_steps(id) on delete set null,
  status chat_thread_status not null default 'open',
  priority chat_priority not null default 'normal',
  subject text,
  context_snapshot jsonb not null default '{}'::jsonb,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_type chat_sender_type,
  created_by_type chat_sender_type not null default 'admin',
  created_by_worker_id uuid references public.workers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint chat_threads_subject_len check (subject is null or char_length(subject) <= 140)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_type chat_sender_type not null,
  sender_worker_id uuid references public.workers(id) on delete set null,
  sender_label text not null,
  body text not null,
  message_kind chat_message_kind not null default 'text',
  client_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint chat_messages_body_len check (char_length(body) between 1 and 1000),
  constraint chat_messages_client_id_len check (client_message_id is null or char_length(client_message_id) <= 120)
);

create table if not exists public.chat_thread_reads (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  reader_key text not null,
  reader_type chat_reader_type not null,
  reader_worker_id uuid references public.workers(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (thread_id, reader_key)
);

create index if not exists chat_threads_worker_status_idx
  on public.chat_threads(worker_id, status, last_message_at desc nulls last);

create index if not exists chat_threads_status_last_message_idx
  on public.chat_threads(status, last_message_at desc nulls last);

create index if not exists chat_threads_session_idx
  on public.chat_threads(session_id)
  where session_id is not null;

create index if not exists chat_threads_job_idx
  on public.chat_threads(job_id)
  where job_id is not null;

create index if not exists chat_threads_station_idx
  on public.chat_threads(station_id)
  where station_id is not null;

create index if not exists chat_messages_thread_created_idx
  on public.chat_messages(thread_id, created_at desc, id desc)
  where deleted_at is null;

create unique index if not exists chat_messages_client_message_unique_idx
  on public.chat_messages(thread_id, client_message_id)
  where client_message_id is not null;

create index if not exists chat_thread_reads_reader_idx
  on public.chat_thread_reads(reader_key, last_read_at desc);

create or replace function public.chat_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chat_threads_set_updated_at on public.chat_threads;
create trigger chat_threads_set_updated_at
  before update on public.chat_threads
  for each row execute function public.chat_set_updated_at();

drop trigger if exists chat_thread_reads_set_updated_at on public.chat_thread_reads;
create trigger chat_thread_reads_set_updated_at
  before update on public.chat_thread_reads
  for each row execute function public.chat_set_updated_at();

create or replace function public.chat_touch_thread_from_message()
returns trigger
language plpgsql
as $$
begin
  update public.chat_threads
  set
    last_message_at = new.created_at,
    last_message_preview = left(new.body, 160),
    last_sender_type = new.sender_type,
    updated_at = now()
  where id = new.thread_id;

  return new;
end;
$$;

drop trigger if exists chat_messages_touch_thread on public.chat_messages;
create trigger chat_messages_touch_thread
  after insert on public.chat_messages
  for each row execute function public.chat_touch_thread_from_message();

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_thread_reads enable row level security;

revoke all on public.chat_threads from anon, authenticated;
revoke all on public.chat_messages from anon, authenticated;
revoke all on public.chat_thread_reads from anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
exception
  when undefined_object then
    null;
end $$;
