-- Trigger function: create notification on new report
CREATE OR REPLACE FUNCTION notify_on_new_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_station_name text;
  v_notification_type text;
  v_title text;
  v_message text;
BEGIN
  -- Get station name
  SELECT s.name INTO v_station_name
  FROM sessions sess
  JOIN stations s ON s.id = sess.station_id
  WHERE sess.id = NEW.session_id;

  -- Determine notification type and title
  IF NEW.type = 'malfunction' THEN
    v_notification_type := 'report_malfunction';
    v_title := 'דיווח תקלה חדש';
    v_message := 'תקלה חדשה בתחנה: ' || COALESCE(v_station_name, 'לא ידוע');
  ELSIF NEW.type = 'general' THEN
    v_notification_type := 'report_general';
    v_title := 'דיווח כללי חדש';
    v_message := 'דיווח חדש מתחנה: ' || COALESCE(v_station_name, 'לא ידוע');
  ELSIF NEW.type = 'scrap' THEN
    v_notification_type := 'report_scrap';
    v_title := 'דיווח פסולת חדש';
    v_message := 'דיווח פסולת בתחנה: ' || COALESCE(v_station_name, 'לא ידוע');
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO notifications (notification_type, title, message, action_type, action_payload)
  VALUES (
    v_notification_type,
    v_title,
    v_message,
    'view_report',
    jsonb_build_object('reportId', NEW.id, 'reportType', NEW.type)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_report
  AFTER INSERT ON reports
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_new_report();

-- Trigger function: create notification on session start/complete/abort
CREATE OR REPLACE FUNCTION notify_on_session_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_worker_name text;
  v_station_name text;
  v_notification_type text;
  v_title text;
  v_message text;
BEGIN
  -- For INSERT: notify new session
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    v_worker_name := COALESCE(NEW.worker_full_name_snapshot, 'לא ידוע');
    v_station_name := COALESCE(NEW.station_name_snapshot, 'לא ידוע');
    v_notification_type := 'session_started';
    v_title := 'סשן חדש נפתח';
    v_message := 'עובד: ' || v_worker_name || ' | תחנה: ' || v_station_name;

    INSERT INTO notifications (notification_type, title, message, action_type, action_payload)
    VALUES (
      v_notification_type,
      v_title,
      v_message,
      'view_session',
      jsonb_build_object('sessionId', NEW.id)
    );
  END IF;

  -- For UPDATE: notify completed or aborted
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status IN ('completed', 'aborted') THEN
    v_worker_name := COALESCE(NEW.worker_full_name_snapshot, 'לא ידוע');
    v_station_name := COALESCE(NEW.station_name_snapshot, 'לא ידוע');

    IF NEW.status = 'completed' THEN
      v_notification_type := 'session_completed';
      v_title := 'סשן הושלם';
      v_message := 'עובד: ' || v_worker_name || ' | תחנה: ' || v_station_name;
    ELSE
      v_notification_type := 'session_aborted';
      v_title := 'סשן בוטל';
      v_message := 'עובד: ' || v_worker_name || ' | תחנה: ' || v_station_name;
    END IF;

    INSERT INTO notifications (notification_type, title, message, action_type, action_payload)
    VALUES (
      v_notification_type,
      v_title,
      v_message,
      'view_session',
      jsonb_build_object('sessionId', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_session_change
  AFTER INSERT OR UPDATE OF status ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_session_change();
