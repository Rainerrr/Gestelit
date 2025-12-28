-- Add CHECK constraint on station_type column
-- This was converted from enum to text in migration 20251210150000 without validation
-- The constraint ensures only valid station types can be inserted

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'station_type_check'
  ) THEN
    ALTER TABLE public.stations
    ADD CONSTRAINT station_type_check CHECK (
      station_type IN (
        'prepress',
        'digital_press',
        'offset',
        'folding',
        'cutting',
        'binding',
        'shrink',
        'lamination',
        'other'
      )
    );
  END IF;
END $$;
