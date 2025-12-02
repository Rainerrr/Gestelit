-- Seed data generated from lib/mocks/רשימת עובדים ת.ז 25.11.2025.xlsx
-- Run node scripts/generate-worker-seed.cjs after updating the spreadsheet.
begin;

-- Stations
insert into stations (name, code, station_type, is_active)
values
  ('H2', 'H2', 'digital_press', true),
  ('H8', 'H8', 'digital_press', true),
  ('CD', 'CD', 'digital_press', true),
  ('קיפול 1/4', 'FOLD_QTR', 'folding', true),
  ('קיפול 1', 'FOLD_1', 'folding', true),
  ('קיפול 2', 'FOLD_2', 'folding', true),
  ('קיפול NBO', 'FOLD_NBO', 'folding', true),
  ('איסוף 20 תאים', 'GATHER_20', 'binding', true),
  ('דבק קטנה', 'GLUE_SMALL', 'binding', true),
  ('דבק גדולה', 'GLUE_LARGE', 'binding', true),
  ('למינציה', 'LAMINATION', 'lamination', true),
  ('חיתוך 1', 'CUT_1', 'cutting', true),
  ('חיתוך 2', 'CUT_2', 'cutting', true),
  ('קוגלר', 'KUGLER', 'binding', true),
  ('סגירת ספירלה 1', 'SPIRAL_CLOSE_1', 'binding', true),
  ('סגירת ספירלה 2', 'SPIRAL_CLOSE_2', 'binding', true),
  ('דרוג', 'STACK_STEP', 'binding', true),
  ('חרור ידני לספירלה', 'SPIRAL_PUNCH_HAND', 'binding', true),
  ('חרור חור', 'PUNCH_HOLE', 'binding', true),
  ('שרינק קטנה', 'SHRINK_SMALL', 'shrink', true),
  ('שרינק גדולה', 'SHRINK_LARGE', 'shrink', true),
  ('לוחות דפוס', 'PLATE_MAKING', 'prepress', true),
  ('דפוס דיגיטלי', 'DIGITAL_PRESS_GENERIC', 'digital_press', true),
  ('חיתוך מדבקות', 'CUT_LABELS', 'cutting', true),
  ('ביגים', 'SCORING', 'cutting', true),
  ('סיכות', 'STAPLES', 'binding', true)
on conflict (code) do update
set
  name = excluded.name,
  station_type = excluded.station_type,
  is_active = true;

-- Placeholder start/end checklists for every station
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

-- Workers
insert into workers (full_name, worker_code, language, role, is_active)
values
  ('חלבי כרמל', '02635356-5', 'auto', 'worker', true),
  ('קמנב קסניה', '34798969-1', 'auto', 'worker', true),
  ('יפרח דני', '05233743-3', 'auto', 'worker', true),
  ('פרידלנדר מיכאל', '30581100-2', 'auto', 'worker', true),
  ('חשמי גאלב', '06063432-6', 'auto', 'worker', true),
  ('אבו ליל עבד אלעזיז', '05937740-8', 'auto', 'worker', true),
  ('קוסטינר יוסי', '03722332-8', 'auto', 'worker', true),
  ('האילו אנטנך', '32904281-6', 'auto', 'worker', true),
  ('סאלח מחמוד', '20459758-7', 'auto', 'worker', true),
  ('רוזן אברהם', '02288313-6', 'auto', 'worker', true),
  ('אסטודילו בהמונדז ראובן אנטוניו', '01566167-1', 'auto', 'worker', true),
  ('כרים אחמד', '02321520-5', 'auto', 'worker', true),
  ('ספורי מוראד', '30169123-4', 'auto', 'worker', true),
  ('גולייב אדלט', '32071259-9', 'auto', 'worker', true),
  ('מחול מזל', '05944532-0', 'auto', 'worker', true),
  ('חביבאללה אסחאק', '03274458-3', 'auto', 'worker', true),
  ('רוחאנא שהרזאד', '05899826-1', 'auto', 'worker', true),
  ('כילאני ענאן', '05301623-4', 'auto', 'worker', true),
  ('גולייב  אלכסנדרה', '31721913-7', 'auto', 'worker', true),
  ('וצריאונוב אנדריי', '32128342-6', 'auto', 'worker', true),
  ('גולומבוק אריק', '33255041-7', 'auto', 'worker', true),
  ('בירסאו קרן', '30968643-4', 'auto', 'worker', true),
  ('סיריאק סופיה', '31956085-0', 'auto', 'worker', true),
  ('אוחנה שמחון', '03627015-5', 'auto', 'worker', true),
  ('סרוליה קרוסמן אנריקה', '34501604-2', 'auto', 'worker', true),
  ('עייש סלמה מויסס', '34518201-8', 'auto', 'worker', true),
  ('איזיקוביץ גוסלין', '33627496-4', 'auto', 'worker', true),
  ('חביבאללה סלאח', '02331966-8', 'auto', 'worker', true),
  ('קזמירצוק אלכסנדר', '34132673-4', 'auto', 'worker', true),
  ('שיני לוריס', '05756443-7', 'auto', 'worker', true),
  ('לוקצקי יוליה', '32370536-8', 'auto', 'worker', true),
  ('קוטליארוב ילנה', '33808202-7', 'auto', 'worker', true),
  ('דה סילבה קרוסמן גוסטבו', '34501605-9', 'auto', 'worker', true),
  ('פירובנו בנדטה', '30482505-2', 'auto', 'worker', true),
  ('קוסטינה אולגה', '34751603-1', 'auto', 'worker', true),
  ('טשחנובה גוזל', '34750065-4', 'auto', 'worker', true),
  ('שלבטוב ויטאלי', '01747907-2', 'auto', 'worker', true)
on conflict (worker_code) do update
set
  full_name = excluded.full_name,
  is_active = excluded.is_active,
  language = excluded.language;

-- Worker to station assignments
insert into worker_stations (worker_id, station_id)
select w.id, s.id
from (values
  ('05233743-3', 'H2'),
  ('30581100-2', 'H2'),
  ('30581100-2', 'H8'),
  ('06063432-6', 'H2'),
  ('06063432-6', 'H8'),
  ('06063432-6', 'CD'),
  ('05937740-8', 'H2'),
  ('05937740-8', 'H8'),
  ('05937740-8', 'CD'),
  ('32904281-6', 'H2'),
  ('32904281-6', 'H8'),
  ('32904281-6', 'CD'),
  ('20459758-7', 'H2'),
  ('20459758-7', 'H8'),
  ('20459758-7', 'CD'),
  ('02288313-6', 'H2'),
  ('02288313-6', 'H8'),
  ('02288313-6', 'CD'),
  ('01566167-1', 'H2'),
  ('01566167-1', 'H8'),
  ('01566167-1', 'CD'),
  ('02321520-5', 'H2'),
  ('02321520-5', 'H8'),
  ('02321520-5', 'CD'),
  ('30169123-4', 'H2'),
  ('30169123-4', 'H8'),
  ('30169123-4', 'CD'),
  ('32071259-9', 'FOLD_1'),
  ('32071259-9', 'FOLD_2'),
  ('32071259-9', 'FOLD_NBO'),
  ('32071259-9', 'GLUE_LARGE'),
  ('32071259-9', 'CUT_1'),
  ('32071259-9', 'STAPLES'),
  ('05944532-0', 'GATHER_20'),
  ('05944532-0', 'GLUE_SMALL'),
  ('05944532-0', 'GLUE_LARGE'),
  ('05944532-0', 'KUGLER'),
  ('05944532-0', 'SPIRAL_CLOSE_1'),
  ('05944532-0', 'SPIRAL_CLOSE_2'),
  ('05944532-0', 'SPIRAL_PUNCH_HAND'),
  ('05944532-0', 'PUNCH_HOLE'),
  ('05944532-0', 'SCORING'),
  ('03274458-3', 'FOLD_1'),
  ('03274458-3', 'FOLD_2'),
  ('05899826-1', 'FOLD_QTR'),
  ('05899826-1', 'GATHER_20'),
  ('05899826-1', 'GLUE_SMALL'),
  ('05899826-1', 'KUGLER'),
  ('05899826-1', 'SPIRAL_CLOSE_1'),
  ('05899826-1', 'SPIRAL_CLOSE_2'),
  ('05899826-1', 'SPIRAL_PUNCH_HAND'),
  ('05899826-1', 'PUNCH_HOLE'),
  ('05899826-1', 'SHRINK_SMALL'),
  ('05899826-1', 'SCORING'),
  ('05301623-4', 'FOLD_QTR'),
  ('05301623-4', 'FOLD_1'),
  ('05301623-4', 'FOLD_2'),
  ('05301623-4', 'FOLD_NBO'),
  ('05301623-4', 'GLUE_SMALL'),
  ('05301623-4', 'LAMINATION'),
  ('05301623-4', 'CUT_1'),
  ('05301623-4', 'CUT_2'),
  ('05301623-4', 'KUGLER'),
  ('31721913-7', 'GATHER_20'),
  ('31721913-7', 'GLUE_SMALL'),
  ('31721913-7', 'GLUE_LARGE'),
  ('31721913-7', 'KUGLER'),
  ('31721913-7', 'SPIRAL_CLOSE_1'),
  ('31721913-7', 'SPIRAL_CLOSE_2'),
  ('31721913-7', 'STACK_STEP'),
  ('31721913-7', 'SPIRAL_PUNCH_HAND'),
  ('31721913-7', 'SCORING'),
  ('31721913-7', 'STAPLES'),
  ('32128342-6', 'FOLD_QTR'),
  ('32128342-6', 'FOLD_1'),
  ('32128342-6', 'FOLD_2'),
  ('32128342-6', 'FOLD_NBO'),
  ('32128342-6', 'GLUE_SMALL'),
  ('32128342-6', 'CUT_1'),
  ('32128342-6', 'CUT_2'),
  ('32128342-6', 'CUT_LABELS'),
  ('32128342-6', 'STAPLES'),
  ('33255041-7', 'CUT_1'),
  ('33255041-7', 'CUT_2'),
  ('30968643-4', 'FOLD_QTR'),
  ('30968643-4', 'FOLD_1'),
  ('30968643-4', 'FOLD_2'),
  ('30968643-4', 'FOLD_NBO'),
  ('30968643-4', 'GATHER_20'),
  ('30968643-4', 'GLUE_SMALL'),
  ('30968643-4', 'CUT_1'),
  ('30968643-4', 'KUGLER'),
  ('30968643-4', 'SPIRAL_CLOSE_1'),
  ('30968643-4', 'SPIRAL_CLOSE_2'),
  ('30968643-4', 'STACK_STEP'),
  ('30968643-4', 'SPIRAL_PUNCH_HAND'),
  ('30968643-4', 'PUNCH_HOLE'),
  ('30968643-4', 'SCORING'),
  ('31956085-0', 'GATHER_20'),
  ('31956085-0', 'GLUE_SMALL'),
  ('31956085-0', 'CUT_LABELS'),
  ('31956085-0', 'STAPLES'),
  ('34501604-2', 'FOLD_1'),
  ('34501604-2', 'FOLD_2'),
  ('34501604-2', 'FOLD_NBO'),
  ('34518201-8', 'FOLD_1'),
  ('34518201-8', 'FOLD_2'),
  ('34518201-8', 'FOLD_NBO'),
  ('02331966-8', 'CUT_1'),
  ('02331966-8', 'CUT_2'),
  ('34132673-4', 'GLUE_LARGE'),
  ('05756443-7', 'SPIRAL_CLOSE_1'),
  ('05756443-7', 'SPIRAL_CLOSE_2'),
  ('05756443-7', 'SPIRAL_PUNCH_HAND'),
  ('05756443-7', 'SHRINK_SMALL'),
  ('34501605-9', 'CUT_1'),
  ('34501605-9', 'CUT_2'),
  ('30482505-2', 'SHRINK_LARGE'),
  ('34750065-4', 'GLUE_LARGE'),
  ('34750065-4', 'SHRINK_LARGE'),
  ('01747907-2', 'FOLD_1'),
  ('01747907-2', 'LAMINATION'),
  ('01747907-2', 'CUT_1'),
  ('01747907-2', 'CUT_2'),
  ('01747907-2', 'PUNCH_HOLE'),
  ('01747907-2', 'SHRINK_SMALL'),
  ('01747907-2', 'SCORING')
) as pair(worker_code, station_code)
join workers w on w.worker_code = pair.worker_code
join stations s on s.code = pair.station_code
on conflict (worker_id, station_id) do nothing;

commit;
