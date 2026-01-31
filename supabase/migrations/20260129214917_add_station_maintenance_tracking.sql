-- Add maintenance tracking columns to stations table
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS maintenance_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_last_date date,
  ADD COLUMN IF NOT EXISTS maintenance_interval_days integer;

-- Index for efficient maintenance queries
CREATE INDEX IF NOT EXISTS idx_stations_maintenance_enabled
  ON stations (maintenance_enabled, maintenance_last_date, maintenance_interval_days)
  WHERE maintenance_enabled = true;

-- Update notification_type constraint to include station_maintenance_due
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type IN (
    'report_malfunction',
    'report_general',
    'report_scrap',
    'session_started',
    'session_completed',
    'session_aborted',
    'first_product_qa_pending',
    'job_due_soon',
    'crud_success',
    'crud_error',
    'station_maintenance_due'
  ));

-- Update action_type constraint to include view_maintenance
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_action_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_action_type_check
  CHECK (action_type IN (
    'view_report',
    'view_session',
    'approve_qa',
    'view_job',
    'view_maintenance'
  ) OR action_type IS NULL);

-- Function to check for stations with maintenance due and create notifications
CREATE OR REPLACE FUNCTION check_maintenance_due_and_notify()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  station_record RECORD;
  next_maintenance_date date;
  days_until_due integer;
BEGIN
  FOR station_record IN
    SELECT id, name, maintenance_last_date, maintenance_interval_days
    FROM stations
    WHERE maintenance_enabled = true
      AND maintenance_last_date IS NOT NULL
      AND maintenance_interval_days IS NOT NULL
      AND is_active = true
  LOOP
    next_maintenance_date := station_record.maintenance_last_date + station_record.maintenance_interval_days;
    days_until_due := next_maintenance_date - CURRENT_DATE;

    -- Notify if maintenance due within 7 days or overdue
    IF days_until_due <= 7
      AND NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE notification_type = 'station_maintenance_due'
          AND action_payload->>'stationId' = station_record.id::text
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
        'תחנה "' || station_record.name || '" - ' ||
        CASE
          WHEN days_until_due < 0 THEN 'באיחור של ' || ABS(days_until_due) || ' ימים'
          WHEN days_until_due = 0 THEN 'טיפול היום'
          ELSE 'טיפול בעוד ' || days_until_due || ' ימים'
        END,
        'view_maintenance',
        jsonb_build_object('stationId', station_record.id)
      );
    END IF;
  END LOOP;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION check_maintenance_due_and_notify TO service_role;
