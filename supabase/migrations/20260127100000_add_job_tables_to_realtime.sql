-- Add wip_balances and job_item_progress to realtime publication
-- This enables the job progress stream to receive change events for real-time updates

-- Note: Using IF NOT EXISTS pattern via DO block to avoid errors if tables are already in publication
DO $$
BEGIN
  -- Add wip_balances to realtime publication if not already added
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'wip_balances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE wip_balances;
  END IF;

  -- Add job_item_progress to realtime publication if not already added
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'job_item_progress'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE job_item_progress;
  END IF;
END $$;
