-- Fix check_due_jobs_and_notify() RPC: reference table alias instead of loop variable in NOT EXISTS subquery
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
          AND action_payload->>'jobId' = jobs.id::text
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
