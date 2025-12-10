-- Migrate station_type enum to text to allow dynamic station types
alter table stations alter column station_type drop default;
alter table stations alter column station_type type text using station_type::text;
update stations
set station_type = coalesce(nullif(trim(station_type), ''), 'other');
alter table stations alter column station_type set default 'other';

-- Drop old enum type if exists
do $$
begin
  if exists (select 1 from pg_type where typname = 'station_type') then
    drop type station_type;
  end if;
end $$;

