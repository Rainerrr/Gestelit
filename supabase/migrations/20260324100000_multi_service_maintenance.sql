-- Multi-service maintenance: replace flat columns with JSONB array
-- Each station can now track multiple maintenance services independently.

-- Step 1: Add the new JSONB column
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS maintenance_services jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Step 2: Migrate existing data
-- Stations with maintenance_enabled=true and valid date/interval get a default service entry
UPDATE stations
SET maintenance_services = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', 'טיפול כללי',
    'last_serviced', maintenance_last_date::text,
    'interval_days', maintenance_interval_days,
    'last_service_worker_id', NULL
  )
)
WHERE maintenance_enabled = true
  AND maintenance_last_date IS NOT NULL
  AND maintenance_interval_days IS NOT NULL;

-- Step 3: Drop old columns
ALTER TABLE stations
  DROP COLUMN IF EXISTS maintenance_last_date,
  DROP COLUMN IF EXISTS maintenance_interval_days;

-- Step 4: Recreate simpler index (just the boolean flag)
DROP INDEX IF EXISTS idx_stations_maintenance_enabled;
CREATE INDEX idx_stations_maintenance_enabled
  ON stations (maintenance_enabled)
  WHERE maintenance_enabled = true;

-- Step 5: Replace the RPC to iterate JSONB array services
CREATE OR REPLACE FUNCTION check_maintenance_due_and_notify()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  station_record RECORD;
  service jsonb;
  service_name text;
  last_serviced_date date;
  interval_days_val integer;
  next_service_date date;
  days_until_due integer;
BEGIN
  FOR station_record IN
    SELECT id, name, maintenance_services
    FROM stations
    WHERE maintenance_enabled = true
      AND is_active = true
      AND jsonb_array_length(maintenance_services) > 0
  LOOP
    FOR service IN SELECT * FROM jsonb_array_elements(station_record.maintenance_services)
    LOOP
      service_name := service->>'name';
      last_serviced_date := (service->>'last_serviced')::date;
      interval_days_val := (service->>'interval_days')::integer;

      -- Skip services without a last_serviced date or interval
      IF last_serviced_date IS NULL OR interval_days_val IS NULL THEN
        CONTINUE;
      END IF;

      next_service_date := last_serviced_date + interval_days_val;
      days_until_due := next_service_date - CURRENT_DATE;

      -- Notify if due within 7 days or overdue
      IF days_until_due <= 7
        AND NOT EXISTS (
          SELECT 1 FROM notifications
          WHERE notification_type = 'station_maintenance_due'
            AND action_payload->>'stationId' = station_record.id::text
            AND action_payload->>'serviceName' = service_name
            AND created_at > now() - interval '1 day'
        )
      THEN
        INSERT INTO notifications (notification_type, title, message, action_type, action_payload)
        VALUES (
          'station_maintenance_due',
          CASE
            WHEN days_until_due < 0 THEN 'טיפול תחנה באיחור'
            ELSE 'טיפול תחנה מתקרב'
          END,
          'תחנה "' || station_record.name || '" - ' || service_name || ': ' ||
          CASE
            WHEN days_until_due < 0 THEN 'באיחור של ' || ABS(days_until_due) || ' ימים'
            WHEN days_until_due = 0 THEN 'טיפול היום'
            ELSE 'טיפול בעוד ' || days_until_due || ' ימים'
          END,
          'view_maintenance',
          jsonb_build_object('stationId', station_record.id, 'serviceName', service_name)
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Re-grant execute
GRANT EXECUTE ON FUNCTION check_maintenance_due_and_notify TO service_role;
