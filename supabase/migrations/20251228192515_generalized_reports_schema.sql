-- Generalized Reports Schema Migration
-- Unifies malfunction, general, and scrap reports into a single system

-- 1. Add report_type to status_definitions (replaces requires_malfunction_report)
ALTER TABLE public.status_definitions
  ADD COLUMN report_type TEXT CHECK (report_type IN ('none', 'malfunction', 'general')) DEFAULT 'none';

-- Migrate existing data: requires_malfunction_report = true becomes 'malfunction'
UPDATE public.status_definitions
SET report_type = CASE WHEN requires_malfunction_report = true THEN 'malfunction' ELSE 'none' END;

-- 2. Create report_reasons table (global reasons for general reports)
CREATE TABLE public.report_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_he TEXT NOT NULL,
  label_ru TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on report_reasons
ALTER TABLE public.report_reasons ENABLE ROW LEVEL SECURITY;

-- 3. Create report type and status enums
DO $$ BEGIN
  CREATE TYPE report_type_enum AS ENUM ('malfunction', 'general', 'scrap');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('new', 'approved', 'open', 'known', 'solved');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Create unified reports table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type report_type_enum NOT NULL,
  station_id UUID REFERENCES public.stations(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  reported_by_worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  description TEXT,
  image_url TEXT,
  station_reason_id TEXT,  -- For malfunctions (JSONB key from station_reasons)
  report_reason_id UUID REFERENCES public.report_reasons(id) ON DELETE SET NULL,
  status report_status NOT NULL DEFAULT 'new',
  status_changed_at TIMESTAMPTZ,
  status_changed_by TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 5. Create indexes for efficient queries
CREATE INDEX reports_type_idx ON public.reports(type);
CREATE INDEX reports_status_idx ON public.reports(status);
CREATE INDEX reports_station_id_idx ON public.reports(station_id);
CREATE INDEX reports_session_id_idx ON public.reports(session_id);
CREATE INDEX reports_created_at_idx ON public.reports(created_at DESC);
CREATE INDEX reports_type_status_idx ON public.reports(type, status);

-- 6. State machine trigger for report status transitions
CREATE OR REPLACE FUNCTION validate_report_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip if status unchanged
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Malfunction reports: open <-> known -> solved, solved -> open (return from archive)
  IF NEW.type = 'malfunction' THEN
    -- From open: can go to known or solved
    IF OLD.status = 'open' AND NEW.status NOT IN ('known', 'solved') THEN
      RAISE EXCEPTION 'Malfunction open can only transition to known or solved';
    END IF;

    -- From known: can only go to solved (no backtrack to open)
    IF OLD.status = 'known' AND NEW.status NOT IN ('solved') THEN
      RAISE EXCEPTION 'Malfunction known can only transition to solved';
    END IF;

    -- From solved: can only go back to open (return from archive)
    IF OLD.status = 'solved' AND NEW.status NOT IN ('open') THEN
      RAISE EXCEPTION 'Malfunction solved can only transition back to open';
    END IF;
  END IF;

  -- General/Scrap reports: new -> approved only (no backtrack)
  IF NEW.type IN ('general', 'scrap') THEN
    -- From new: can only go to approved
    IF OLD.status = 'new' AND NEW.status != 'approved' THEN
      RAISE EXCEPTION 'General/scrap reports can only transition from new to approved';
    END IF;

    -- From approved: cannot transition anywhere
    IF OLD.status = 'approved' THEN
      RAISE EXCEPTION 'Cannot transition from approved status';
    END IF;
  END IF;

  -- Update status_changed_at timestamp
  NEW.status_changed_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_state_transition_check
BEFORE UPDATE OF status ON public.reports
FOR EACH ROW EXECUTE FUNCTION validate_report_transition();

-- 7. Add scrap_report_submitted to sessions (tracks if scrap report was submitted)
ALTER TABLE public.sessions
  ADD COLUMN scrap_report_submitted BOOLEAN NOT NULL DEFAULT false;

-- 8. Set default status based on report type (malfunction starts as 'open', others as 'new')
CREATE OR REPLACE FUNCTION set_report_default_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'malfunction' THEN
    NEW.status = 'open';
  ELSE
    NEW.status = 'new';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER report_set_default_status
BEFORE INSERT ON public.reports
FOR EACH ROW EXECUTE FUNCTION set_report_default_status();

-- 9. Update malfunction status in status_events when linked report changes
-- (Maintains compatibility with existing status_events.malfunction_id references)
