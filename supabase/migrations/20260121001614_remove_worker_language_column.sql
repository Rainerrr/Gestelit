-- Remove the language column from workers table
-- Language preference is now global (via flag toggle) instead of per-worker

-- Drop the column (this also removes any check constraints on it)
ALTER TABLE workers DROP COLUMN IF EXISTS language;

-- Add comment explaining the change
COMMENT ON TABLE workers IS 'Workers table. Language preference was removed in favor of global language switcher.';
