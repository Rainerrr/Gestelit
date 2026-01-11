-- Migration: Atomic production line stations update
-- Fixes race condition where delete-then-insert could leave orphaned lines

-- Create a function for atomic station replacement
CREATE OR REPLACE FUNCTION replace_production_line_stations(
  p_line_id UUID,
  p_station_ids UUID[]
)
RETURNS TABLE (
  out_id UUID,
  out_production_line_id UUID,
  out_station_id UUID,
  out_position INTEGER,
  out_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete existing station assignments
  DELETE FROM production_line_stations pls
  WHERE pls.production_line_id = p_line_id;

  -- Insert new station assignments with positions
  IF array_length(p_station_ids, 1) > 0 THEN
    RETURN QUERY
    INSERT INTO production_line_stations (production_line_id, station_id, "position")
    SELECT p_line_id, s.sid, s.pos::INTEGER
    FROM unnest(p_station_ids) WITH ORDINALITY AS s(sid, pos)
    RETURNING
      production_line_stations.id,
      production_line_stations.production_line_id,
      production_line_stations.station_id,
      production_line_stations."position",
      production_line_stations.created_at;
  END IF;

  -- Update the production line's updated_at timestamp
  UPDATE production_lines pl
  SET updated_at = now()
  WHERE pl.id = p_line_id;

  RETURN;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION replace_production_line_stations(UUID, UUID[]) TO service_role;
