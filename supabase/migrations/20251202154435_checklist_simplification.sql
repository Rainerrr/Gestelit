-- Migration: Simplify Checklist Schema
-- This migration moves checklists from separate tables to JSON columns on stations
-- Run this in your Supabase SQL Editor

BEGIN;

-- Step 1: Add new JSON columns to stations table (if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'stations' AND column_name = 'start_checklist'
  ) THEN
    ALTER TABLE stations 
    ADD COLUMN start_checklist jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'stations' AND column_name = 'end_checklist'
  ) THEN
    ALTER TABLE stations 
    ADD COLUMN end_checklist jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Step 2: Migrate existing checklist data (if old tables exist)
-- This migrates checklists and checklist_items into the new JSON format
DO $$
DECLARE
  station_rec RECORD;
  checklist_rec RECORD;
  items_json jsonb;
BEGIN
  -- Only run if old tables exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'checklists'
  ) THEN
    -- Migrate start checklists
    FOR station_rec IN 
      SELECT DISTINCT s.id, s.station_type 
      FROM stations s
      WHERE EXISTS (
        SELECT 1 FROM checklists c 
        WHERE c.station_type = s.station_type AND c.kind = 'start' AND c.is_active = true
      )
    LOOP
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ci.id::text,
          'order_index', ci.order_index,
          'label_he', ci.label_he,
          'label_ru', ci.label_ru,
          'is_required', ci.is_required
        ) ORDER BY ci.order_index
      )
      INTO items_json
      FROM checklists c
      JOIN checklist_items ci ON ci.checklist_id = c.id
      WHERE c.station_type = station_rec.station_type
        AND c.kind = 'start'
        AND c.is_active = true
        AND EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'checklist_items'
        );
      
      IF items_json IS NOT NULL THEN
        UPDATE stations 
        SET start_checklist = items_json
        WHERE id = station_rec.id;
      END IF;
    END LOOP;

    -- Migrate end checklists
    FOR station_rec IN 
      SELECT DISTINCT s.id, s.station_type 
      FROM stations s
      WHERE EXISTS (
        SELECT 1 FROM checklists c 
        WHERE c.station_type = s.station_type AND c.kind = 'end' AND c.is_active = true
      )
    LOOP
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ci.id::text,
          'order_index', ci.order_index,
          'label_he', ci.label_he,
          'label_ru', ci.label_ru,
          'is_required', ci.is_required
        ) ORDER BY ci.order_index
      )
      INTO items_json
      FROM checklists c
      JOIN checklist_items ci ON ci.checklist_id = c.id
      WHERE c.station_type = station_rec.station_type
        AND c.kind = 'end'
        AND c.is_active = true
        AND EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'checklist_items'
        );
      
      IF items_json IS NOT NULL THEN
        UPDATE stations 
        SET end_checklist = items_json
        WHERE id = station_rec.id;
      END IF;
    END LOOP;
  END IF;
END $$;

-- Step 3a: Drop foreign key constraint on checklist_item_id if it exists
ALTER TABLE checklist_responses DROP CONSTRAINT IF EXISTS checklist_responses_checklist_item_id_fkey;

-- Step 3: Update checklist_responses table structure
DO $$
BEGIN
  -- Add new columns if they don't exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'checklist_responses'
  ) THEN
    -- Add station_id column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'checklist_responses' AND column_name = 'station_id'
    ) THEN
      ALTER TABLE checklist_responses 
      ADD COLUMN station_id uuid REFERENCES stations(id) ON DELETE CASCADE;
      
      -- Backfill station_id from sessions
      UPDATE checklist_responses cr
      SET station_id = s.station_id
      FROM sessions s
      WHERE cr.session_id = s.id 
        AND cr.station_id IS NULL;
      
      -- Make it NOT NULL after backfilling
      ALTER TABLE checklist_responses 
      ALTER COLUMN station_id SET NOT NULL;
    END IF;

    -- Add kind column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'checklist_responses' AND column_name = 'kind'
    ) THEN
      ALTER TABLE checklist_responses 
      ADD COLUMN kind checklist_kind;
      
      -- Backfill kind from checklist_items -> checklists (if old structure exists)
      IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'checklist_items'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'checklist_responses' AND column_name = 'checklist_item_id'
      ) THEN
        UPDATE checklist_responses cr
        SET kind = c.kind
        FROM checklist_items ci
        JOIN checklists c ON c.id = ci.checklist_id
        WHERE cr.checklist_item_id = ci.id 
          AND cr.kind IS NULL;
      END IF;
      
      -- Set default for any remaining NULLs (you may want to review these)
      UPDATE checklist_responses 
      SET kind = 'start' 
      WHERE kind IS NULL;
      
      -- Make it NOT NULL after backfilling
      ALTER TABLE checklist_responses 
      ALTER COLUMN kind SET NOT NULL;
    END IF;

    -- Rename checklist_item_id to item_id if old column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'checklist_responses' AND column_name = 'checklist_item_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'checklist_responses' AND column_name = 'item_id'
    ) THEN
      -- Drop foreign key constraint if it exists (execute separately before renaming)
      -- Rename the column
      ALTER TABLE checklist_responses 
      RENAME COLUMN checklist_item_id TO item_id;
      
      -- Change item_id to text type
      ALTER TABLE checklist_responses 
      ALTER COLUMN item_id TYPE text USING item_id::text;
    END IF;
  ELSE
    -- Create the table if it doesn't exist
    CREATE TABLE checklist_responses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      station_id uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
      kind checklist_kind NOT NULL,
      item_id text NOT NULL,
      value_bool boolean,
      value_text text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS checklist_responses_session_idx
  ON checklist_responses(session_id);

CREATE INDEX IF NOT EXISTS checklist_responses_station_kind_idx
  ON checklist_responses(station_id, kind);

-- Step 5: Drop old indexes if they exist
DROP INDEX IF EXISTS checklist_responses_checklist_item_idx;

COMMIT;

-- Step 6: VERIFY MIGRATION (run these queries to check)
-- SELECT id, name, jsonb_array_length(start_checklist) as start_items, jsonb_array_length(end_checklist) as end_items 
-- FROM stations LIMIT 5;
--
-- SELECT COUNT(*) as total_responses, COUNT(DISTINCT station_id) as stations_with_responses
-- FROM checklist_responses;

-- Step 7: CLEANUP (only run after verifying everything works - UNCOMMENT WHEN READY)
-- BEGIN;
-- DROP TABLE IF EXISTS checklist_items CASCADE;
-- DROP TABLE IF EXISTS checklists CASCADE;
-- COMMIT;

