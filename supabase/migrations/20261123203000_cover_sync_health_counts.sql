-- After a large historical backfill, run VACUUM (ANALYZE) on these raw tables
-- outside a transaction so PostgreSQL can use index-only count/max scans.
-- Narrow covering indexes let exact health count/MAX avoid raw JSONB heap scans.
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_dfhazmrashi_sync_health ON public.bina_dfhazmrashi(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_dfhazmmontage_sync_health ON public.bina_dfhazmmontage(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_dfhazmnigrar_sync_health ON public.bina_dfhazmnigrar(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_dfhazmgimur_sync_health ON public.bina_dfhazmgimur(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_dfhazmgrafika_sync_health ON public.bina_dfhazmgrafika(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_dfhazmkirkia_sync_health ON public.bina_dfhazmkirkia(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_dfhazmkedam_sync_health ON public.bina_dfhazmkedam(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_dfhazmglyonot_sync_health ON public.bina_dfhazmglyonot(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_dfmlay_sync_health ON public.bina_dfmlay(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_tnuotmlay_sync_health ON public.bina_tnuotmlay(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_mismahim_sync_health ON public.bina_mismahim(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_heshsapakrashi_sync_health ON public.bina_heshsapakrashi(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_heshsapaknigrar_sync_health ON public.bina_heshsapaknigrar(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_tmsapaknigrar_sync_health ON public.bina_tmsapaknigrar(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_bakashanigrar_sync_health ON public.bina_bakashanigrar(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_hovot_sync_health ON public.bina_hovot(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_dfshelita_sync_health ON public.bina_dfshelita(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_heshbonitrashi_sync_health ON public.bina_heshbonitrashi(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_heshbonitnigrar_sync_health ON public.bina_heshbonitnigrar(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_mishloahrashi_sync_health ON public.bina_mishloahrashi(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_mishloahnigrar_sync_health ON public.bina_mishloahnigrar(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_tovinrashi_sync_health ON public.bina_tovinrashi(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_tovinnigrar_sync_health ON public.bina_tovinnigrar(synced_at); COMMIT;
BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; CREATE INDEX IF NOT EXISTS idx_bina_sqllogins_sync_health ON public.bina_sqllogins(synced_at); COMMIT;
