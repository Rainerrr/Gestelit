-- Promote station-level reasons with a built-in general malfunction, migrate existing data,
-- and drop the legacy global reasons table.

-- 1) Columns for station-scoped reason ids (text to keep existing UUIDs)
alter table malfunctions
  add column if not exists station_reason_id text;

alter table status_events
  add column if not exists station_reason_id text;

-- 2) Default station reasons: always include the general malfunction
alter table stations
  alter column station_reasons set default
    '[{"id":"general-malfunction","label_he":"תקלת כללית","label_ru":"Общая неисправность","is_active":true}]'::jsonb;

-- 3) Merge existing station reasons, legacy reasons table entries, and the default general malfunction
do $$
declare
  general jsonb := jsonb_build_object(
    'id', 'general-malfunction',
    'label_he', 'תקלת כללית',
    'label_ru', 'Общая неисправность',
    'is_active', true
  );
  legacy_reasons jsonb := '[]'::jsonb;
begin
  if to_regclass('public.reasons') is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id::text,
          'label_he', r.label_he,
          'label_ru', r.label_ru,
          'is_active', r.is_active
        )
      ),
      '[]'::jsonb
    )
    into legacy_reasons
    from reasons r;
  end if;

  update stations s
  set station_reasons = (
    select jsonb_agg(obj order by obj->>'id')
    from (
      select distinct on (obj->>'id') obj
      from (
        select jsonb_array_elements(coalesce(s.station_reasons, '[]'::jsonb)) as obj
        union all
        select general
        union all
        select jsonb_array_elements(legacy_reasons) as obj
      ) all_objs(obj)
      order by obj->>'id', obj
    ) dedup
  );
end $$;

-- 4) Backfill station_reason_id for malfunctions
update malfunctions m
set station_reason_id = 'general-malfunction'
from stations s
where s.id = m.station_id
  and m.station_reason_id is null;

-- 5) Backfill station_reason_id for status events (via session->station)
update status_events se
set station_reason_id = 'general-malfunction'
from sessions sess
join stations s on s.id = sess.station_id
where se.session_id = sess.id
  and se.station_reason_id is null;

-- Ensure any remaining nulls are set to the default
update malfunctions set station_reason_id = 'general-malfunction' where station_reason_id is null;
update status_events set station_reason_id = 'general-malfunction' where station_reason_id is null;

-- 6) Drop legacy FK columns and table
alter table malfunctions drop column if exists reason_id;
alter table status_events drop column if exists reason_id;

drop table if exists reasons;
drop type if exists reason_type;

