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

CREATE TABLE bina_dfhazmkirkia (
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

CREATE TABLE bina_dfmlay (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_tnuotmlay (
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

CREATE TABLE bina_heshsapakrashi (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_heshsapaknigrar (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_tmsapaknigrar (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_bakashanigrar (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_hovot (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_dfshelita (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_heshbonitrashi (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_heshbonitnigrar (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_mishloahrashi (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_mishloahnigrar (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_tovinrashi (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_tovinnigrar (
  bina_id text PRIMARY KEY,
  data jsonb NOT NULL,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bina_sqllogins (
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
CREATE INDEX bina_dfhazmkirkia_data_gin ON bina_dfhazmkirkia USING gin (data);
CREATE INDEX bina_dfhazmkedam_data_gin ON bina_dfhazmkedam USING gin (data);
CREATE INDEX bina_dfhazmglyonot_data_gin ON bina_dfhazmglyonot USING gin (data);
CREATE INDEX bina_dfmlay_data_gin ON bina_dfmlay USING gin (data);
CREATE INDEX bina_tnuotmlay_data_gin ON bina_tnuotmlay USING gin (data);
CREATE INDEX bina_mismahim_data_gin ON bina_mismahim USING gin (data);
CREATE INDEX bina_heshsapakrashi_data_gin ON bina_heshsapakrashi USING gin (data);
CREATE INDEX bina_heshsapaknigrar_data_gin ON bina_heshsapaknigrar USING gin (data);
CREATE INDEX bina_tmsapaknigrar_data_gin ON bina_tmsapaknigrar USING gin (data);
CREATE INDEX bina_bakashanigrar_data_gin ON bina_bakashanigrar USING gin (data);
CREATE INDEX bina_hovot_data_gin ON bina_hovot USING gin (data);
CREATE INDEX bina_dfshelita_data_gin ON bina_dfshelita USING gin (data);
CREATE INDEX bina_heshbonitrashi_data_gin ON bina_heshbonitrashi USING gin (data);
CREATE INDEX bina_heshbonitnigrar_data_gin ON bina_heshbonitnigrar USING gin (data);
CREATE INDEX bina_mishloahrashi_data_gin ON bina_mishloahrashi USING gin (data);
CREATE INDEX bina_mishloahnigrar_data_gin ON bina_mishloahnigrar USING gin (data);
CREATE INDEX bina_tovinrashi_data_gin ON bina_tovinrashi USING gin (data);
CREATE INDEX bina_tovinnigrar_data_gin ON bina_tovinnigrar USING gin (data);
CREATE INDEX bina_sqllogins_data_gin ON bina_sqllogins USING gin (data);

ALTER TABLE bina_dfhazmrashi ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmmontage ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmnigrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmgimur ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmgrafika ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmkirkia ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmkedam ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfhazmglyonot ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfmlay ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_tnuotmlay ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_mismahim ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_heshsapakrashi ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_heshsapaknigrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_tmsapaknigrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_bakashanigrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_hovot ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_dfshelita ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_heshbonitrashi ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_heshbonitnigrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_mishloahrashi ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_mishloahnigrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_tovinrashi ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_tovinnigrar ENABLE ROW LEVEL SECURITY;
ALTER TABLE bina_sqllogins ENABLE ROW LEVEL SECURITY;
