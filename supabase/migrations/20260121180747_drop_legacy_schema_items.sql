-- Migration: Drop legacy/redundant schema items
-- This migration cleans up deprecated columns and duplicate views identified during schema audit

-- 1. Drop deprecated column: stations.requires_first_product_qa
-- This column is deprecated in favor of job_item_steps.requires_first_product_approval
-- Verified: 0 stations have this flag set to true
ALTER TABLE public.stations DROP COLUMN IF EXISTS requires_first_product_qa;

-- 2. Drop duplicate view: session_wip_accounting
-- This view is identical to v_session_wip_accounting (which follows naming convention)
DROP VIEW IF EXISTS public.session_wip_accounting;

-- 3. Drop unused column: jobs.planned_quantity
-- Quantity tracking has moved to job_items.planned_quantity
-- Verified: All 8 jobs have NULL for this column
ALTER TABLE public.jobs DROP COLUMN IF EXISTS planned_quantity;
