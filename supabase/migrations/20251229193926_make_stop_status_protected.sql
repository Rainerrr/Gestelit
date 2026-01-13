-- Make the "עצירה" (stop) status protected
-- This status is used as the default initial status for new sessions
-- It still requires a general report when selected manually by the worker,
-- but the initial status event is marked with is_initial=true to skip the report requirement

-- Mark the stop status as protected (keep report_type as 'general')
UPDATE public.status_definitions
SET is_protected = TRUE
WHERE label_he = 'עצירה' AND scope = 'global';

-- If the stop status doesn't exist, create it
INSERT INTO public.status_definitions (scope, station_id, label_he, label_ru, color_hex, machine_state, report_type, is_protected)
SELECT 'global', NULL, 'עצירה', 'Остановка', '#f97316', 'stoppage', 'general', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.status_definitions WHERE label_he = 'עצירה' AND scope = 'global'
);
