-- Cover the small global station census without reading the wide raw JSON heap.
SET lock_timeout = '3s';
CREATE INDEX IF NOT EXISTS idx_bina_control_station_census
 ON public.bina_dfshelita (reporting_machine_name, reporting_work_order_id) INCLUDE (synced_at);
CREATE INDEX IF NOT EXISTS idx_bina_sheets_station_census
 ON public.bina_dfhazmglyonot (reporting_machine_name, reporting_work_order_id) INCLUDE (synced_at);
ANALYZE public.bina_dfshelita;
ANALYZE public.bina_dfhazmglyonot;
RESET lock_timeout;
