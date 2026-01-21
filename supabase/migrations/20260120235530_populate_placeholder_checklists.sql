-- Populate placeholder checklists for all stations
-- Format: [station name] 1/2/3 start/end

BEGIN;

-- Update all stations with standardized 3-item placeholder checklists
WITH checklist_data AS (
  SELECT
    id,
    name,
    code,
    -- Build start checklist
    jsonb_build_array(
      jsonb_build_object(
        'id', format('placeholder-%s-start-1', lower(code)),
        'order_index', 0,
        'label_he', format('%s 1 start', name),
        'label_ru', format('%s 1 start', name),
        'is_required', true
      ),
      jsonb_build_object(
        'id', format('placeholder-%s-start-2', lower(code)),
        'order_index', 1,
        'label_he', format('%s 2 start', name),
        'label_ru', format('%s 2 start', name),
        'is_required', true
      ),
      jsonb_build_object(
        'id', format('placeholder-%s-start-3', lower(code)),
        'order_index', 2,
        'label_he', format('%s 3 start', name),
        'label_ru', format('%s 3 start', name),
        'is_required', true
      )
    ) AS new_start_checklist,
    -- Build end checklist
    jsonb_build_array(
      jsonb_build_object(
        'id', format('placeholder-%s-end-1', lower(code)),
        'order_index', 0,
        'label_he', format('%s 1 end', name),
        'label_ru', format('%s 1 end', name),
        'is_required', true
      ),
      jsonb_build_object(
        'id', format('placeholder-%s-end-2', lower(code)),
        'order_index', 1,
        'label_he', format('%s 2 end', name),
        'label_ru', format('%s 2 end', name),
        'is_required', true
      ),
      jsonb_build_object(
        'id', format('placeholder-%s-end-3', lower(code)),
        'order_index', 2,
        'label_he', format('%s 3 end', name),
        'label_ru', format('%s 3 end', name),
        'is_required', true
      )
    ) AS new_end_checklist
  FROM stations
)
UPDATE stations s
SET
  start_checklist = cd.new_start_checklist,
  end_checklist = cd.new_end_checklist,
  updated_at = now()
FROM checklist_data cd
WHERE s.id = cd.id;

COMMIT;
