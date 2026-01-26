-- Notifications table for admin notification center
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL CHECK (notification_type IN (
    'report_malfunction',
    'report_general',
    'report_scrap',
    'session_started',
    'session_completed',
    'session_aborted',
    'first_product_qa_pending',
    'job_due_soon',
    'crud_success',
    'crud_error'
  )),
  title text NOT NULL,
  message text NOT NULL,
  action_type text CHECK (action_type IN (
    'view_report',
    'view_session',
    'approve_qa',
    'view_job'
  ) OR action_type IS NULL),
  action_payload jsonb,
  is_read boolean NOT NULL DEFAULT false,
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_created_at ON notifications (created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (is_read, is_dismissed)
  WHERE is_read = false AND is_dismissed = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON notifications
  FOR ALL USING (true) WITH CHECK (true);

-- Daily cleanup function
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM notifications
  WHERE created_at < now() - interval '1 day';
END;
$$;

-- Job due date check function (creates notifications for jobs due tomorrow)
CREATE OR REPLACE FUNCTION check_due_jobs_and_notify()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN
    SELECT id, job_number, due_date
    FROM jobs
    WHERE due_date = CURRENT_DATE + INTERVAL '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE notification_type = 'job_due_soon'
          AND action_payload->>'jobId' = job_record.id::text
          AND created_at > now() - interval '1 day'
      )
  LOOP
    INSERT INTO notifications (notification_type, title, message, action_type, action_payload)
    VALUES (
      'job_due_soon',
      'עבודה בסמוך למועד יעד',
      'עבודה ' || job_record.job_number || ' מסתיימת מחר (' || to_char(job_record.due_date, 'DD/MM/YYYY') || ')',
      'view_job',
      jsonb_build_object('jobId', job_record.id)
    );
  END LOOP;
END;
$$;
