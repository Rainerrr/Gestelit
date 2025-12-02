-- Backfill placeholder start/end checklists for all stations
begin;

with station_series as (
  select id, name, code
  from stations
),
start_items as (
  select
    s.id,
    jsonb_agg(
      jsonb_build_object(
        'id',
        format('placeholder-%s-start-%s', lower(s.code), g.idx),
        'order_index',
        g.idx,
        'label_he',
        format('%s start %s', s.name, g.idx),
        'label_ru',
        format('%s start %s', s.name, g.idx),
        'is_required',
        true
      )
      order by g.idx
    ) as items
  from station_series s
  cross join generate_series(1, 3) as g(idx)
  group by s.id, s.name, s.code
),
end_items as (
  select
    s.id,
    jsonb_agg(
      jsonb_build_object(
        'id',
        format('placeholder-%s-end-%s', lower(s.code), g.idx),
        'order_index',
        g.idx,
        'label_he',
        format('%s end %s', s.name, g.idx),
        'label_ru',
        format('%s end %s', s.name, g.idx),
        'is_required',
        true
      )
      order by g.idx
    ) as items
  from station_series s
  cross join generate_series(1, 3) as g(idx)
  group by s.id, s.name, s.code
)
update stations s
set
  start_checklist = start_items.items,
  end_checklist = end_items.items,
  updated_at = now()
from start_items
join end_items on end_items.id = start_items.id
where s.id = start_items.id;

commit;

