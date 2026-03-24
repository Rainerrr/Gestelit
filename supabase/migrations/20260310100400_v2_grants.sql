-- Grants for end_production_status_atomic_v2
GRANT EXECUTE ON FUNCTION end_production_status_atomic_v2(UUID, UUID, INTEGER, INTEGER, UUID) TO authenticated, service_role;
