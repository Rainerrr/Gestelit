-- Finance and sales work-order links used to scan all invoice headers.
SET lock_timeout = '3s';
CREATE INDEX IF NOT EXISTS idx_bina_invoice_order ON public.bina_heshbonitrashi(public.bina_json_int(data->>'MisparHazmana'));
CREATE INDEX IF NOT EXISTS idx_bina_orders_received ON public.bina_dfhazmrashi(public.bina_json_timestamptz(data->>'TarikKabala'));
ANALYZE public.bina_heshbonitrashi;
ANALYZE public.bina_dfhazmrashi;
