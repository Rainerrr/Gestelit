-- Raw BINA imports. Keep the source rows as JSONB so BINA schema changes do not
-- require a production migration before the next sync can run.
CREATE TABLE bina_dfhazmrashi (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_dfhazmmontage (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_dfhazmnigrar (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_dfhazmgimur (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_dfhazmgrafika (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_dfhazmktiva (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_dfhazmkedam (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_dfhazmglyonot (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_mismahim (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bina_dfhazmrashi_data_gin ON bina_dfhazmrashi USING gin (data);
CREATE INDEX bina_dfhazmmontage_data_gin ON bina_dfhazmmontage USING gin (data);
CREATE INDEX bina_dfhazmnigrar_data_gin ON bina_dfhazmnigrar USING gin (data);
CREATE INDEX bina_dfhazmgimur_data_gin ON bina_dfhazmgimur USING gin (data);
CREATE INDEX bina_dfhazmgrafika_data_gin ON bina_dfhazmgrafika USING gin (data);
CREATE INDEX bina_dfhazmktiva_data_gin ON bina_dfhazmktiva USING gin (data);
CREATE INDEX bina_dfhazmkedam_data_gin ON bina_dfhazmkedam USING gin (data);
CREATE INDEX bina_dfhazmglyonot_data_gin ON bina_dfhazmglyonot USING gin (data);
CREATE INDEX bina_mismahim_data_gin ON bina_mismahim USING gin (data);

ALTER TABLE bina_dfhazmrashi ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmmontage ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmnigrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmgimur ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmgrafika ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmktiva ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmkedam ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmglyonot ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_mismahim ENABLE ROW LEVEL SECURITY;
