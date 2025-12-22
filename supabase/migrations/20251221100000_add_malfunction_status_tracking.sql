-- Add status and reported_by columns to malfunctions table for admin tracking

-- Status: 'open' (default), 'known' (acknowledged), 'solved' (archived)
alter table malfunctions
  add column if not exists status text not null default 'open'
    check (status in ('open', 'known', 'solved'));

-- Track who reported the malfunction (optional, for existing records)
alter table malfunctions
  add column if not exists reported_by_worker_id uuid references workers(id) on delete set null;

-- Track when status was last changed
alter table malfunctions
  add column if not exists status_changed_at timestamptz;

-- Track who changed the status (admin tracking)
alter table malfunctions
  add column if not exists status_changed_by text;

-- Add notes field for admin comments when changing status
alter table malfunctions
  add column if not exists admin_notes text;

-- Add index for filtering by status
create index if not exists malfunctions_status_idx on malfunctions(status);

-- Add index for filtering open malfunctions (most common query)
create index if not exists malfunctions_open_idx on malfunctions(station_id) where status != 'solved';
