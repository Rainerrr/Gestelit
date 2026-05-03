-- Sync log to track BINA data imports
CREATE TABLE bina_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at timestamptz NOT NULL,
  results jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bina_sync_log ENABLE ROW LEVEL SECURITY;
