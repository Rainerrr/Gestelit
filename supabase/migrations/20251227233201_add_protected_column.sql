-- Add is_protected column to status_definitions
-- This replaces fragile Hebrew label matching with a robust database-level flag

ALTER TABLE public.status_definitions
ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark existing protected statuses by their Hebrew labels
-- These are the core statuses that cannot be edited or deleted
UPDATE public.status_definitions
SET is_protected = TRUE
WHERE label_he IN ('אחר', 'ייצור', 'תקלה');

-- Create index for protected status lookups
CREATE INDEX IF NOT EXISTS status_definitions_protected_idx ON public.status_definitions(is_protected) WHERE is_protected = TRUE;
