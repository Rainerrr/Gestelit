-- Add JSONB schema validation for station columns
-- Validates start_checklist and end_checklist have proper structure

-- Function to validate checklist JSONB structure
CREATE OR REPLACE FUNCTION validate_checklist_jsonb(data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Must be an array
  IF jsonb_typeof(data) != 'array' THEN
    RETURN FALSE;
  END IF;

  -- Empty array is valid
  IF jsonb_array_length(data) = 0 THEN
    RETURN TRUE;
  END IF;

  -- Each item must have required fields: id, label_he, order_index
  RETURN NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(data) AS item
    WHERE NOT (
      item ? 'id' AND
      item ? 'label_he' AND
      item ? 'order_index'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to validate station_reasons JSONB structure
CREATE OR REPLACE FUNCTION validate_station_reasons_jsonb(data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Must be an array
  IF jsonb_typeof(data) != 'array' THEN
    RETURN FALSE;
  END IF;

  -- Empty array is valid
  IF jsonb_array_length(data) = 0 THEN
    RETURN TRUE;
  END IF;

  -- Each item must have required fields: id, label_he
  RETURN NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(data) AS item
    WHERE NOT (
      item ? 'id' AND
      item ? 'label_he'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add constraints (only if they don't exist to make migration idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_start_checklist'
  ) THEN
    ALTER TABLE public.stations
    ADD CONSTRAINT valid_start_checklist CHECK (validate_checklist_jsonb(start_checklist));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_end_checklist'
  ) THEN
    ALTER TABLE public.stations
    ADD CONSTRAINT valid_end_checklist CHECK (validate_checklist_jsonb(end_checklist));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_station_reasons'
  ) THEN
    ALTER TABLE public.stations
    ADD CONSTRAINT valid_station_reasons CHECK (validate_station_reasons_jsonb(station_reasons));
  END IF;
END $$;
