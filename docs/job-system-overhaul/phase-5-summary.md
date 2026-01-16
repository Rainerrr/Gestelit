# Phase 5 Summary: Pipeline-Only Model & Legacy Cleanup

## Overview

Phase 5 completes the Job System Overhaul by:
1. Migrating all legacy production lines and station-based job items to the unified pipeline model
2. Removing the "Production Lines" management tab from the admin UI
3. Simplifying the job creation flow to be pipeline-only
4. Dropping legacy database columns and tables

## Changes Made

### Part A: Database Migrations

#### Migration 1: `20260114000010_migrate_production_lines_to_presets.sql`
- Migrates `production_lines` → `pipeline_presets`
- Migrates `production_line_stations` → `pipeline_preset_steps`
- Converts all `job_items` (station, line, pipeline kinds) to unified pipeline model
- Creates `job_item_steps` for items missing them
- Populates names for items without names
- Creates missing `wip_balances` and `job_item_progress` records

#### Migration 2: `20260114000020_job_items_name_not_null.sql`
- Makes `job_items.name` NOT NULL after data migration
- Adds index for name search

### Part B: UI/UX Refactoring

#### New Components
- **`components/admin/pipeline-flow-editor.tsx`**: Reusable pipeline station editor with:
  - Drag-and-drop reordering (using @dnd-kit)
  - Responsive design (horizontal on desktop, vertical list on mobile)
  - Load from preset or build from scratch
  - Visual indicators for first/last stations
  - Variant sizes (compact, default, large)

#### Refactored Components

**`job-creation-wizard.tsx`**:
- Removed kind toggle (station/line/pipeline) - now pipeline-only
- Added required product name field
- Uses shared PipelineFlowEditor component
- Cleaner multi-product workflow

**`job-items-dialog.tsx`**:
- Removed kind toggle - pipeline-only
- Added product name field
- Uses shared PipelineFlowEditor component
- Widened dialog for better pipeline visualization

**`jobs-management.tsx`**:
- Updated assignment summary to show "X מוצרים" (X products) instead of station/line counts
- Updated item display to prefer explicit names
- Simplified progress bar logic for pipeline model

**`management-dashboard.tsx`**:
- Removed "קווי ייצור" (Production Lines) tab from capsule navigation
- Removed all production lines state and handlers
- Removed ProductionLinesManagement and ProductionLineStationsDialog imports

### Part C: Code Cleanup

#### Removed Files
- `lib/data/production-lines.ts`
- `app/admin/manage/_components/production-lines-management.tsx`
- `app/admin/manage/_components/production-line-stations-dialog.tsx`
- `app/api/admin/production-lines/` (entire directory)

#### Updated Files
- `lib/types.ts`: Added deprecation notices to `JobItemKind`, `ProductionLine`, and related types
- `lib/api/admin-management.ts`: Removed production lines API functions

### Part D: Final Schema Cleanup

#### Migration 3: `20260114000030_phase5b_schema_cleanup.sql` (DESTRUCTIVE)
**WARNING: Run only after verifying data migration succeeded!**

- Drops XOR constraint on `job_items`
- Drops `station_id` and `production_line_id` columns from `job_items`
- Drops `production_line_stations` table
- Drops `production_lines` table
- Drops `kind` column from `job_items` (now redundant)
- Cleans up deprecated `job_item_station_id` columns

## Migration Order

1. **Deploy code changes** (this PR)
2. **Run data migration**: `20260114000010_migrate_production_lines_to_presets.sql`
3. **Verify data migration**:
   ```sql
   -- Check all job_items have names
   SELECT COUNT(*) FROM job_items WHERE name IS NULL;

   -- Check all job_items have at least one step
   SELECT ji.id, ji.name FROM job_items ji
   WHERE NOT EXISTS (SELECT 1 FROM job_item_steps jis WHERE jis.job_item_id = ji.id);

   -- Check production_lines were migrated
   SELECT COUNT(*) as lines FROM production_lines;
   SELECT COUNT(*) as presets FROM pipeline_presets;
   ```
4. **Make name NOT NULL**: `20260114000020_job_items_name_not_null.sql`
5. **Run final cleanup** (after thorough testing): `20260114000030_phase5b_schema_cleanup.sql`

## New Data Model

After Phase 5, the job system uses a unified pipeline model:

```
job
└── job_items (products with names)
    ├── name (required, e.g., "גוף A", "מכסה B")
    ├── planned_quantity
    ├── pipeline_preset_id (optional provenance reference)
    ├── is_pipeline_locked (prevents modification once production starts)
    └── job_item_steps (ordered station sequence)
        ├── station_id
        ├── position
        └── is_terminal
```

## Breaking Changes

1. **Production Lines tab removed** - Admins should use "תבניות צינור" (Pipeline Presets) instead
2. **Job creation requires product name** - Each product must have a name, not just a station/line reference
3. **Legacy APIs removed** - `/api/admin/production-lines/*` endpoints no longer exist

## Rollback Plan

If issues arise before running the final cleanup migration:
1. The code changes can be reverted via git
2. The data migration (Migration 1) is additive and doesn't delete data
3. Production lines and their data remain intact until Migration 3

**After running Migration 3, rollback requires database restore from backup.**

## Testing Checklist

- [ ] Create new job with multiple products via wizard
- [ ] Add products to existing job via items dialog
- [ ] Verify pipeline presets load correctly
- [ ] Verify drag-and-drop station reordering works
- [ ] Verify responsive layout (horizontal on desktop, vertical on mobile)
- [ ] Verify existing jobs display correctly with migrated data
- [ ] Verify worker flow works with pipeline items
- [ ] Verify WIP tracking works correctly
- [ ] Run integration tests: `npm run test:run`
