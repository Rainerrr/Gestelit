-- Worker Flow Phase 1: Schema Extensions
-- Applied to branch: yzpwxlgvfkkidjsphfzv

-- 1. Add quantity tracking to status_events
ALTER TABLE status_events ADD COLUMN IF NOT EXISTS quantity_good INTEGER DEFAULT 0;
ALTER TABLE status_events ADD COLUMN IF NOT EXISTS quantity_scrap INTEGER DEFAULT 0;

COMMENT ON COLUMN status_events.quantity_good IS 'Good units produced during this status event period';
COMMENT ON COLUMN status_events.quantity_scrap IS 'Scrap units during this status event period';

-- 2. Add first product QA flag to stations
ALTER TABLE stations ADD COLUMN IF NOT EXISTS requires_first_product_qa BOOLEAN DEFAULT false;

COMMENT ON COLUMN stations.requires_first_product_qa IS 'If true, first product QA approval required before production';

-- 3. Add QA tracking columns to reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS job_item_id UUID REFERENCES job_items(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_first_product_qa BOOLEAN DEFAULT false;

COMMENT ON COLUMN reports.job_item_id IS 'Links QA reports to specific job items';
COMMENT ON COLUMN reports.is_first_product_qa IS 'True for first product QA approval requests';

-- 4. Create index for efficient QA lookups
CREATE INDEX IF NOT EXISTS idx_reports_first_product_qa
  ON reports(job_item_id, station_id)
  WHERE is_first_product_qa = true;
