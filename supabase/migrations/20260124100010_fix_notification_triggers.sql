-- Fix notify_on_session_change() to JOIN workers/stations instead of relying on snapshot columns
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
  -- Always resolve names via JOIN (snapshots may not be populated yet at INSERT time)
  SELECT w.full_name INTO v_worker_name
  FROM workers w
  WHERE w.id = NEW.worker_id;

  SELECT s.name INTO v_station_name
  FROM stations s
  WHERE s.id = NEW.station_id;

  v_worker_name := COALESCE(v_worker_name, NEW.worker_full_name_snapshot, 'לא ידוע');
  v_station_name := COALESCE(v_station_name, NEW.station_name_snapshot, 'לא ידוע');

  -- For INSERT: notify new session
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    v_notification_type := 'session_started';
    v_title := 'משמרת חדשה נפתחה';
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
    IF NEW.status = 'completed' THEN
      v_notification_type := 'session_completed';
      v_title := 'משמרת הושלמה';
    ELSE
      v_notification_type := 'session_aborted';
      v_title := 'משמרת בוטלה';
    END IF;

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

  RETURN NEW;
END;
$$;

-- Fix notify_on_new_report() to also resolve worker name for richer messages
CREATE OR REPLACE FUNCTION notify_on_new_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_station_name text;
  v_worker_name text;
  v_notification_type text;
  v_title text;
  v_message text;
BEGIN
  -- Get station and worker name via session
  SELECT s.name, w.full_name
  INTO v_station_name, v_worker_name
  FROM sessions sess
  JOIN stations s ON s.id = sess.station_id
  JOIN workers w ON w.id = sess.worker_id
  WHERE sess.id = NEW.session_id;

  v_station_name := COALESCE(v_station_name, 'לא ידוע');
  v_worker_name := COALESCE(v_worker_name, '');

  -- Determine notification type and title
  IF NEW.type = 'malfunction' THEN
    v_notification_type := 'report_malfunction';
    v_title := 'דיווח תקלה חדש';
    v_message := 'תקלה חדשה בתחנה: ' || v_station_name;
  ELSIF NEW.type = 'general' THEN
    v_notification_type := 'report_general';
    v_title := 'דיווח כללי חדש';
    v_message := 'דיווח חדש מתחנה: ' || v_station_name;
  ELSIF NEW.type = 'scrap' THEN
    v_notification_type := 'report_scrap';
    v_title := 'דיווח פסולת חדש';
    v_message := 'דיווח פסולת בתחנה: ' || v_station_name;
  ELSE
    RETURN NEW;
  END IF;

  -- Append worker name if available
  IF v_worker_name <> '' THEN
    v_message := v_message || ' | עובד: ' || v_worker_name;
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
