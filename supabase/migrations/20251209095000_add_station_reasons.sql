alter table stations
add column if not exists station_reasons jsonb not null default '[]'::jsonb;

