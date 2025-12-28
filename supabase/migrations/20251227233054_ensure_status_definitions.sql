-- Ensure status_definitions table exists (idempotent)
-- This migration fixes the empty 20251212100000_status_definitions.sql migration
-- by ensuring the table structure exists for environments where it may be missing

CREATE TABLE IF NOT EXISTS public.status_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'station')),
  station_id UUID REFERENCES public.stations(id) ON DELETE CASCADE,
  label_he TEXT NOT NULL,
  label_ru TEXT,
  color_hex TEXT NOT NULL DEFAULT '#94a3b8',
  is_stoppage BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT status_definitions_station_scope_check CHECK (
    (scope = 'global' AND station_id IS NULL) OR
    (scope = 'station' AND station_id IS NOT NULL)
  )
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS status_definitions_scope_idx ON public.status_definitions(scope);
CREATE INDEX IF NOT EXISTS status_definitions_station_idx ON public.status_definitions(station_id);
