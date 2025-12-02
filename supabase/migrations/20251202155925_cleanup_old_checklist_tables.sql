-- Cleanup: Drop old checklist tables
-- This removes the old checklists and checklist_items tables
-- as they have been replaced by JSON columns on the stations table

BEGIN;

-- Drop the old checklist_items table first (it has foreign key to checklists)
DROP TABLE IF EXISTS checklist_items CASCADE;

-- Drop the old checklists table
DROP TABLE IF EXISTS checklists CASCADE;

COMMIT;

