# Phase 2 Summary: Admin UI for Pipeline Presets

**Date completed:** 2026-01-13

## Overview

Phase 2 implements the admin UI for managing Pipeline Presets and integrates them into the Job Item creation workflow. Admins can now create reusable pipeline templates and assign them to job items.

## Files Created

### Data Layer

| File | Description |
|------|-------------|
| `lib/data/pipeline-presets.ts` | Data layer for pipeline preset CRUD operations |

### API Routes

| File | Description |
|------|-------------|
| `app/api/admin/pipeline-presets/route.ts` | GET all presets, POST create new preset |
| `app/api/admin/pipeline-presets/[id]/route.ts` | GET/PUT/DELETE individual preset |
| `app/api/admin/pipeline-presets/[id]/steps/route.ts` | PUT to replace all steps in a preset |
| `app/api/admin/pipeline-presets/available-stations/route.ts` | GET available stations for step selection |

### UI Components

| File | Description |
|------|-------------|
| `app/admin/manage/_components/pipeline-preset-form-dialog.tsx` | Dialog for creating/editing preset metadata |
| `app/admin/manage/_components/pipeline-preset-steps-dialog.tsx` | Dialog for editing pipeline steps with ordering |
| `app/admin/manage/_components/pipeline-presets-management.tsx` | Main management table for presets |

### Migrations

| File | Description |
|------|-------------|
| `20260113190001_extend_rebuild_for_pipeline.sql` | Extends `rebuild_job_item_steps` RPC to handle `pipeline` kind |

## Files Modified

### Data Layer

| File | Changes |
|------|---------|
| `lib/data/job-items.ts` | Added `pipeline_preset_id` to `CreateJobItemPayload`, updated queries to include `pipeline_presets` relation, added pipeline kind support throughout |
| `lib/api/admin-management.ts` | Added pipeline preset API functions and `JobItemPayload` with `pipeline_preset_id` |
| `lib/types.ts` | Extended `JobItemKind` to include `"pipeline"` |

### API Routes

| File | Changes |
|------|---------|
| `app/api/admin/jobs/[id]/items/route.ts` | Added `pipeline_preset_id` field and validation for `kind="pipeline"` |

### UI Components

| File | Changes |
|------|---------|
| `app/admin/manage/_components/management-dashboard.tsx` | Added "תבניות תהליך" (Pipeline Presets) tab with full CRUD integration |
| `app/admin/manage/_components/job-items-dialog.tsx` | Added pipeline preset selector for creating pipeline-kind job items |

## New API Endpoints

### Pipeline Presets

```
GET    /api/admin/pipeline-presets                    # List all presets with steps
POST   /api/admin/pipeline-presets                    # Create new preset
GET    /api/admin/pipeline-presets/:id                # Get single preset
PUT    /api/admin/pipeline-presets/:id                # Update preset metadata
DELETE /api/admin/pipeline-presets/:id                # Delete preset (if not in use)
PUT    /api/admin/pipeline-presets/:id/steps          # Replace all steps
GET    /api/admin/pipeline-presets/available-stations # Get stations for step selection
```

### Job Items (Extended)

```
POST   /api/admin/jobs/:id/items
  Body: {
    kind: "pipeline",
    pipeline_preset_id: "<uuid>",
    planned_quantity: <number>,
    is_active?: boolean
  }
```

## Type Changes

### Extended `JobItemKind`

```typescript
// Before
export type JobItemKind = "station" | "line";

// After
export type JobItemKind = "station" | "line" | "pipeline";
```

### Extended `CreateJobItemPayload`

```typescript
export type CreateJobItemPayload = {
  job_id: string;
  kind: JobItemKind;
  station_id?: string | null;
  production_line_id?: string | null;
  pipeline_preset_id?: string | null;  // NEW
  planned_quantity: number;
  is_active?: boolean;
};
```

## RPC Function Updates

### `rebuild_job_item_steps(p_job_item_id UUID)`

Extended to handle three kinds:
- `station` - Creates single job_item_step from `station_id`
- `line` - Expands from `production_line_stations` (existing)
- `pipeline` - Expands from `pipeline_preset_steps` (NEW)

## Admin UI Features

### Pipeline Presets Tab ("תבניות תהליך")

- **List View**: Shows all presets with name, step count, step preview, and status
- **Create**: Dialog to add name, description, and active status
- **Edit**: Modify preset metadata (name, description, active status)
- **Edit Steps**: Dedicated dialog to manage pipeline steps
  - Add stations from available list
  - Remove stations from pipeline
  - Move up/down to reorder steps
  - Shows step position and name
- **Delete**: Confirmation dialog with in-use check (prevents deletion if used in active job items)

### Job Item Creation (Extended)

- Three-way kind selector: Station / Production Line / Pipeline Preset
- When "Pipeline" selected, shows dropdown of active presets
- Purple badge and Workflow icon distinguish pipeline items in the list

## Validation Rules

### Pipeline Preset Creation
- Name is required
- Description is optional
- `is_active` defaults to true

### Pipeline Preset Steps
- Steps are defined as ordered station_id array
- Duplicate stations allowed (same station can appear multiple times)
- Minimum 1 step required for use in job items

### Job Item Creation (Pipeline Kind)
- `pipeline_preset_id` required when `kind="pipeline"`
- Preset must exist and be active
- Preset must have at least one step
- XOR constraint: only one of `station_id`, `production_line_id`, or `pipeline_preset_id`
- Duplicate check: same preset cannot be assigned twice to same job

## Data Flow

```
Pipeline Preset Creation:
  Admin creates preset → Admin adds steps → Preset ready for use

Job Item Creation (Pipeline Kind):
  Admin selects job → Opens job items dialog → Selects "Pipeline" kind →
  Selects preset from dropdown → Sets quantity → Submit →
  createJobItem() validates preset → Inserts job_item row →
  rebuild_job_item_steps() RPC → Creates job_item_steps from preset steps →
  Creates wip_balances for each step → Done
```

## Known Pre-existing Issues

The following TypeScript errors exist from previous Phase 1 work and are unrelated to Phase 2:

1. `jobItemStepId` vs `jobItemStationId` naming inconsistencies in worker flow components
2. Test files referencing outdated payload structures

These will need to be addressed in a follow-up refactoring task.

## Testing Checklist

- [ ] Create a new pipeline preset
- [ ] Add/remove/reorder steps in a preset
- [ ] Edit preset metadata
- [ ] Delete unused preset
- [ ] Cannot delete preset in use
- [ ] Create job item with pipeline kind
- [ ] View pipeline preset info in job items list
- [ ] Verify job_item_steps created from preset steps

## Next Steps (Phase 3)

1. Update worker flow to handle pipeline kind job items
2. Show pipeline visualization in station selection
3. Track WIP per pipeline step
4. Production quantity reporting with pipeline context
