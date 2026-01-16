# Phase 1 Summary: Schema & Data Structure

**Date completed:** 2026-01-13

## Migrations Applied

| File | Description |
|------|-------------|
| `20260113180010_create_pipeline_presets.sql` | Creates `pipeline_presets` and `pipeline_preset_steps` tables for reusable pipeline templates |
| `20260113180020_extend_job_items.sql` | Adds `name`, `pipeline_preset_id`, and `is_pipeline_locked` columns to `job_items` |
| `20260113180030_rename_to_job_item_steps.sql` | Renames `job_item_stations` table to `job_item_steps` |
| `20260113180040_rename_step_columns.sql` | Renames FK columns from `job_item_station_id` to `job_item_step_id` throughout |
| `20260113180050_extend_status_events.sql` | Adds `job_item_id` and `job_item_step_id` columns to `status_events` |
| `20260113180060_pipeline_lock_trigger.sql` | Creates trigger to auto-lock pipeline when production starts |
| `20260113180070_rpc_setup_pipeline.sql` | Creates `setup_job_item_pipeline()` RPC function |
| `20260113180080_rpc_update_wip_v3.sql` | Creates `update_session_quantities_atomic_v3()` with new column names |

## Schema Changes

### New Tables

| Table | Purpose |
|-------|---------|
| `pipeline_presets` | Reusable pipeline templates (replaces production_lines conceptually) |
| `pipeline_preset_steps` | Ordered stations within a pipeline preset (no station exclusivity) |

### Renamed Tables

| Old Name | New Name |
|----------|----------|
| `job_item_stations` | `job_item_steps` |

### New Columns

| Table | Column | Type | Description |
|-------|--------|------|-------------|
| `job_items` | `name` | TEXT | Custom name for the job item (nullable for now) |
| `job_items` | `pipeline_preset_id` | UUID | Reference to the preset used (provenance) |
| `job_items` | `is_pipeline_locked` | BOOLEAN | Prevents modification after production starts |
| `status_events` | `job_item_id` | UUID | Links status event to job item |
| `status_events` | `job_item_step_id` | UUID | Links status event to specific pipeline step |

### Renamed Columns

| Table | Old Column | New Column |
|-------|------------|------------|
| `sessions` | `job_item_station_id` | `job_item_step_id` |
| `wip_balances` | `job_item_station_id` | `job_item_step_id` |
| `wip_consumptions` | `from_job_item_station_id` | `from_job_item_step_id` |

### New/Updated Functions

| Function | Description |
|----------|-------------|
| `setup_job_item_pipeline(UUID, UUID[], UUID)` | Sets up job_item_steps from station array |
| `update_session_quantities_atomic_v3(UUID, INTEGER, INTEGER)` | WIP management with new column names |
| `lock_job_item_pipeline_on_production()` | Trigger function to lock pipeline on production start |

### Updated Views

| View | Changes |
|------|---------|
| `session_wip_accounting` | Updated to use `job_item_step_id` column name |

## API Changes

None in Phase 1 - API updates will come in Phase 2.

## UI Changes

None in Phase 1 - UI updates will come in Phase 2.

## Type Changes (`lib/types.ts`)

### New Types

```typescript
interface PipelinePreset { id, name, description?, is_active }
interface PipelinePresetStep { id, pipeline_preset_id, station_id, position, station? }
interface PipelinePresetWithSteps extends PipelinePreset { steps: PipelinePresetStep[] }
```

### Updated Types

```typescript
// JobItem - new fields
interface JobItem {
  name?: string | null;           // NEW
  pipeline_preset_id?: string;    // NEW
  is_pipeline_locked?: boolean;   // NEW
  pipeline_preset?: { id, name }; // NEW
}

// Session - renamed field
interface Session {
  job_item_step_id?: string;      // renamed from job_item_station_id
}

// StatusEvent - new fields
interface StatusEvent {
  job_item_id?: string;           // NEW
  job_item_step_id?: string;      // NEW
}

// WipBalance, WipConsumption, SessionWipAccounting - renamed fields
```

### Renamed Types

```typescript
// JobItemStation -> JobItemStep (with deprecated alias)
type JobItemStation = JobItemStep; // @deprecated
```

## Breaking Changes

1. **Column renames** - Any code referencing `job_item_station_id` must be updated to `job_item_step_id`
2. **Table rename** - `job_item_stations` is now `job_item_steps`
3. **Function signature** - New `update_session_quantities_atomic_v3` should be used instead of v2

## Testing Performed

1. ✅ Verified all new tables exist (`pipeline_presets`, `pipeline_preset_steps`, `job_item_steps`)
2. ✅ Verified all new columns added to `job_items` and `status_events`
3. ✅ Verified column renames in `sessions`, `wip_balances`, `wip_consumptions`
4. ✅ Verified new functions created (`setup_job_item_pipeline`, `update_session_quantities_atomic_v3`, `lock_job_item_pipeline_on_production`)
5. ✅ Verified `session_wip_accounting` view updated

## Known Issues

1. **Migration 1A (pipeline_presets)** - Had already been partially applied; trigger already existed. This is not a problem as `CREATE TABLE IF NOT EXISTS` handles it gracefully.

2. **View column reference** - The `session_wip_accounting` view needed to use `CASE WHEN wc.is_scrap = FALSE/TRUE` instead of a non-existent `scrap_used` column. Fixed in migration file.

## Next Steps (Phase 2)

1. Create `lib/data/pipeline-presets.ts` data layer
2. Create admin API routes for pipeline preset CRUD
3. Create `PipelinePresetsManagement` component
4. Create `PipelineFlowchartEditor` component
5. Update `JobItemFormDialog` with pipeline mode selector
6. Update `JobsManagement` to show pipeline visualization
