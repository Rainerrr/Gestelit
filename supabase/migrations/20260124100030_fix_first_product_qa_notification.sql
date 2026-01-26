-- Fix notify_on_new_report() to detect first product QA reports and use distinct notification type
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
  v_action_type text;
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
  v_action_type := 'view_report';

  -- Check for first product QA before general report
  IF NEW.is_first_product_qa = true THEN
    v_notification_type := 'first_product_qa_pending';
    v_title := 'אישור מוצר ראשון ממתין';
    v_message := 'תחנה: ' || v_station_name;
    v_action_type := 'approve_qa';
    IF v_worker_name <> '' THEN
      v_message := v_message || ' | עובד: ' || v_worker_name;
    END IF;
  ELSIF NEW.type = 'malfunction' THEN
    v_notification_type := 'report_malfunction';
    v_title := 'דיווח תקלה חדש';
    v_message := 'תקלה חדשה בתחנה: ' || v_station_name;
    IF v_worker_name <> '' THEN
      v_message := v_message || ' | עובד: ' || v_worker_name;
    END IF;
  ELSIF NEW.type = 'general' THEN
    v_notification_type := 'report_general';
    v_title := 'דיווח כללי חדש';
    v_message := 'דיווח חדש מתחנה: ' || v_station_name;
    IF v_worker_name <> '' THEN
      v_message := v_message || ' | עובד: ' || v_worker_name;
    END IF;
  ELSIF NEW.type = 'scrap' THEN
    v_notification_type := 'report_scrap';
    v_title := 'דיווח פסולת חדש';
    v_message := 'דיווח פסולת בתחנה: ' || v_station_name;
    IF v_worker_name <> '' THEN
      v_message := v_message || ' | עובד: ' || v_worker_name;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO notifications (notification_type, title, message, action_type, action_payload)
  VALUES (
    v_notification_type,
    v_title,
    v_message,
    v_action_type,
    jsonb_build_object('reportId', NEW.id, 'reportType', NEW.type)
  );

  RETURN NEW;
END;
$$;
