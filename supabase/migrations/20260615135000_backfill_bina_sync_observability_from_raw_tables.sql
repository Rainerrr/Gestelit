-- One-time observability backfill from existing raw BINA tables.
-- This does not mutate BINA data. It only records current raw table coverage into
-- bina_sync_runs/bina_sync_table_runs so dashboards do not appear empty until the
-- next PowerShell sync posts metadata-aware batches.

DO $$
DECLARE
  contract_row record;
  run_id uuid;
  table_row_count integer := 0;
  table_min_key text;
  table_max_key text;
  table_min_date timestamptz;
  table_max_date timestamptz;
  latest_table_synced_at timestamptz;
  total_tables integer := 0;
  total_rows integer := 0;
  failed_tables integer := 0;
  latest_seen_at timestamptz;
BEGIN
  SELECT COUNT(*)::integer INTO total_tables
  FROM public.bina_source_contracts
  WHERE is_enabled = true;

  INSERT INTO public.bina_sync_runs (
    source_synced_at,
    status,
    sync_mode,
    extractor_version,
    table_count,
    metadata
  ) VALUES (
    now(),
    'running',
    'observability_backfill',
    'server_backfill_20260615',
    total_tables,
    jsonb_build_object('source', 'raw_bina_tables', 'note', 'One-time backfill from existing synced raw tables')
  )
  RETURNING id INTO run_id;

  FOR contract_row IN
    SELECT source_table, storage_table
    FROM public.bina_source_contracts
    WHERE is_enabled = true
    ORDER BY source_table
  LOOP
    BEGIN
      EXECUTE format(
        'SELECT COUNT(*)::integer, MIN(bina_id)::text, MAX(bina_id)::text, MIN(source_updated_at), MAX(source_updated_at), MAX(synced_at) FROM public.%I',
        contract_row.storage_table
      )
      INTO table_row_count, table_min_key, table_max_key, table_min_date, table_max_date, latest_table_synced_at;

      total_rows := total_rows + COALESCE(table_row_count, 0);
      latest_seen_at := CASE
        WHEN latest_seen_at IS NULL THEN latest_table_synced_at
        WHEN latest_table_synced_at IS NULL THEN latest_seen_at
        ELSE GREATEST(latest_seen_at, latest_table_synced_at)
      END;

      INSERT INTO public.bina_sync_table_runs (
        run_id,
        source_table,
        storage_table,
        status,
        sent_count,
        upserted_count,
        failed_count,
        source_min_key,
        source_max_key,
        source_min_date,
        source_max_date,
        metadata,
        created_at
      ) VALUES (
        run_id,
        contract_row.source_table,
        contract_row.storage_table,
        CASE WHEN COALESCE(table_row_count, 0) > 0 THEN 'success' ELSE 'skipped' END,
        COALESCE(table_row_count, 0),
        COALESCE(table_row_count, 0),
        0,
        table_min_key,
        table_max_key,
        table_min_date,
        table_max_date,
        jsonb_build_object('source', 'raw_table_backfill', 'latest_raw_synced_at', latest_table_synced_at),
        COALESCE(latest_table_synced_at, now())
      );
    EXCEPTION WHEN OTHERS THEN
      failed_tables := failed_tables + 1;
      INSERT INTO public.bina_sync_table_runs (
        run_id,
        source_table,
        storage_table,
        status,
        failed_count,
        error,
        metadata
      ) VALUES (
        run_id,
        contract_row.source_table,
        contract_row.storage_table,
        'error',
        1,
        SQLERRM,
        jsonb_build_object('source', 'raw_table_backfill')
      );
    END;
  END LOOP;

  UPDATE public.bina_sync_runs
  SET
    source_synced_at = COALESCE(latest_seen_at, source_synced_at),
    finished_at = now(),
    status = CASE WHEN failed_tables > 0 THEN 'partial_error' ELSE 'success' END,
    sent_count = total_rows,
    upserted_count = total_rows,
    failed_count = failed_tables,
    error = CASE WHEN failed_tables > 0 THEN 'OBSERVABILITY_BACKFILL_PARTIAL' ELSE NULL END
  WHERE id = run_id;
END $$;
