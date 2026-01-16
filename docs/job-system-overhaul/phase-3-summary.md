# Phase 3 Summary: Worker Flow, Job/Item Selection & UI/UX Improvements

**Date completed:** 2026-01-13

## Overview

Phase 3 completes the renaming of `jobItemStationId` to `jobItemStepId` across the entire worker flow, ensuring consistency with the Phase 1 database schema changes. This phase also fixes remaining table/column reference issues in data layer queries.

**Additional work completed:**
- Custom pipeline support (ad-hoc station arrays without preset)
- Inline pipeline flow editor with drag-and-drop
- Minimum 1 station validation for pipelines
- Unified semantic color styling
- Pipeline support in job creation wizard

## Files Modified

### Data Layer

| File | Changes |
|------|---------|
| `lib/data/job-items.ts` | Fixed select queries to use `job_item_steps` instead of `job_item_stations`; updated internal type references |
| `lib/data/sessions.ts` | Already updated in prior work; verified using `job_item_step_id` column |
| `lib/data/admin-dashboard.ts` | Already updated in prior work; verified using `job_item_step_id` column |

### API Layer

| File | Changes |
|------|---------|
| `lib/api/client.ts` | Updated `AvailableJobItem` type to use `jobItemStepId`; updated `bindJobItemToSessionApi` function parameter |
| `app/api/sessions/bind-job-item/route.ts` | Supports both `jobItemStepId` (new) and `jobItemStationId` (deprecated) for backwards compatibility |
| `app/api/sessions/route.ts` | Already using `p_job_item_step_id` parameter |

### Context Layer

| File | Changes |
|------|---------|
| `contexts/WorkerSessionContext.tsx` | Updated `ActiveJobItemContext` type to use `jobItemStepId` with deprecated `jobItemStationId` alias |

### Worker Flow Components

| File | Changes |
|------|---------|
| `app/(worker)/work/page.tsx` | Updated `proceedWithProduction` to use `jobItemStepId` |
| `app/(worker)/station/page.tsx` | Updated `Selection` type and `handleStationSelect` handler to use `jobItemStepId` |
| `components/worker/job-item-card.tsx` | Updated callback type signature to use `jobItemStepId` |
| `components/worker/production-line-stepper.tsx` | Updated callback type signature to use `jobItemStepId` |

### Admin Components

| File | Changes |
|------|---------|
| `app/admin/_components/live-job-progress.tsx` | Updated React key props to use `jobItemStepId` |

## Type Changes

### `ActiveJobItemContext` (contexts/WorkerSessionContext.tsx)

```typescript
// Before
export type ActiveJobItemContext = {
  id: string;
  jobId: string;
  name: string;
  kind: JobItemKind;
  plannedQuantity: number;
  jobItemStationId: string;
};

// After
export type ActiveJobItemContext = {
  id: string;
  jobId: string;
  name: string;
  kind: JobItemKind;
  plannedQuantity: number;
  /** @deprecated Use jobItemStepId */
  jobItemStationId?: string;
  jobItemStepId: string;
};
```

### `AvailableJobItem` (lib/api/client.ts)

```typescript
// Before
export type AvailableJobItem = {
  id: string;
  jobId: string;
  name: string;
  kind: JobItemKind;
  plannedQuantity: number;
  completedGood: number;
  remaining: number;
  jobItemStationId: string;
};

// After
export type AvailableJobItem = {
  id: string;
  jobId: string;
  name: string;
  kind: JobItemKind;
  plannedQuantity: number;
  completedGood: number;
  remaining: number;
  /** @deprecated Use jobItemStepId */
  jobItemStationId?: string;
  jobItemStepId: string;
};
```

## Query Changes

### `fetchJobItemsForJob` (lib/data/job-items.ts)

```typescript
// Before
selectParts.push("job_item_stations(*, stations(*))");

// After
selectParts.push("job_item_steps(*, stations(*))");
```

### `getJobItemById` (lib/data/job-items.ts)

```typescript
// Before
job_item_stations(*, stations(*))

// After
job_item_steps(*, stations(*))
```

## API Changes

### `bindJobItemToSessionApi` (lib/api/client.ts)

```typescript
// Before
export async function bindJobItemToSessionApi(
  sessionId: string,
  jobId: string,
  jobItemId: string,
  jobItemStationId: string,
): Promise<Session>

// After
export async function bindJobItemToSessionApi(
  sessionId: string,
  jobId: string,
  jobItemId: string,
  jobItemStepId: string,
): Promise<Session>
```

## Backwards Compatibility

The following mechanisms ensure backwards compatibility:

1. **API Route**: `bind-job-item` accepts both `jobItemStepId` (preferred) and `jobItemStationId` (deprecated)
2. **Types**: All affected types include deprecated alias fields with JSDoc deprecation markers
3. **Data Layer**: `AvailableJobItem` in `lib/data/job-items.ts` returns both `jobItemStationId` and `jobItemStepId`

## Data Flow

```
Worker Flow:
  Station Selection → Job Selection Dialog → Production Status →

  1. Worker selects station
  2. Worker clicks production status button
  3. Job selection dialog opens
  4. Worker selects job + job item
  5. bindJobItemToSessionApi(sessionId, jobId, jobItemId, jobItemStepId)
  6. Session updated with job_item_step_id
  7. Context updated with activeJobItem (includes jobItemStepId)
  8. Production begins
```

## Testing Checklist

- [x] TypeScript compilation passes
- [x] Production build passes
- [ ] Worker can select station without job
- [ ] Worker can enter production and select job from dialog
- [ ] Session correctly records job_item_step_id
- [ ] Context shows job item name during production
- [ ] Admin dashboard shows correct WIP distribution

## Known Issues

None - all TypeScript errors have been resolved.

---

## UI/UX Improvements (Extended Scope)

### Custom Pipelines (Ad-hoc Station Arrays)

Previously, pipelines required a pre-saved preset. Now users can:
- **Start fresh**: Build a pipeline from scratch for a specific job item
- **Load preset as-is**: Use existing preset without modification
- **Load preset + edit**: Load preset as starting point, customize for this job

Custom pipelines are stored directly in `job_item_steps` without referencing a preset.

### Inline Pipeline Flow Editor

New drag-and-drop visual editor for building pipelines:
- Horizontal flow chart visualization
- First station highlighted in emerald (entry point)
- Last station highlighted in amber (terminal/exit)
- Drag-and-drop reordering using dnd-kit
- Add stations from dropdown
- Remove stations with X button

### Minimum 1 Station Validation

Pipeline presets and custom pipelines now require at least one station:
- Save button disabled when no stations
- Error message displayed when attempting to save empty pipeline

### Unified Semantic Color Theme

Replaced hardcoded `zinc-*` colors with semantic theme variables:

| Before | After |
|--------|-------|
| `border-zinc-800` | `border-border` |
| `bg-zinc-900` | `bg-card` |
| `text-zinc-400` | `text-muted-foreground` |

## Additional Files Modified (UI/UX)

### Data Layer

| File | Changes |
|------|---------|
| `lib/data/job-items.ts` | Added `station_ids?: string[]` to `CreateJobItemPayload`; custom pipeline creation; fixed RPC to `rebuild_job_item_steps` |
| `lib/api/admin-management.ts` | Added `station_ids?: string[]` to `JobItemPayload` |

### API Routes

| File | Changes |
|------|---------|
| `app/api/admin/jobs/[id]/items/route.ts` | Added `station_ids` validation; accepts either `pipeline_preset_id` OR `station_ids` |

### Migrations

| File | Changes |
|------|---------|
| `20260113190001_extend_rebuild_for_pipeline.sql` | Fixed column: `job_item_station_id` → `job_item_step_id` |
| `20260113190002_update_create_session_atomic.sql` | Updated RPC to use `job_item_step_id` |

### UI Components

| File | Changes |
|------|---------|
| `pipeline-preset-steps-dialog.tsx` | Min 1 station validation |
| `job-items-dialog.tsx` | Complete rewrite with inline pipeline flow editor |
| `job-creation-wizard.tsx` | Added pipeline support + flow editor |
| `jobs-management.tsx` | Updated to semantic color theme |

## Extended Type Changes

### `CreateJobItemPayload`

```typescript
export type CreateJobItemPayload = {
  job_id: string;
  kind: JobItemKind;
  station_id?: string | null;
  production_line_id?: string | null;
  pipeline_preset_id?: string | null;
  station_ids?: string[];  // NEW: Custom station order for pipelines
  planned_quantity: number;
  is_active?: boolean;
};
```

## API Changes

### POST `/api/admin/jobs/:id/items`

Now accepts custom pipelines via `station_ids` array:

```json
// Using custom station order (NEW)
{
  "kind": "pipeline",
  "station_ids": ["<station-uuid-1>", "<station-uuid-2>"],
  "planned_quantity": 100
}
```

For `kind="pipeline"`: EITHER `pipeline_preset_id` OR `station_ids` must be provided.

## Issues Resolved

1. **`crypto.randomUUID is not a function`**: Fixed with timestamp-based ID for client-side state
2. **500 error on job item creation**: Fixed RPC name and column name in migration

## Next Steps (Phase 4)

1. Enhance quantity reporting with job item context
2. Update status event recording to include `job_item_id` and `job_item_step_id`
3. Implement WIP balance updates during production
4. Add production quantity tracking per pipeline step

## Future (Phase 5)

1. Legacy decommissioning - migrate production_lines to pipeline presets
2. Remove deprecated `kind` column XOR constraint
3. Make `job_items.name` NOT NULL after data migration
4. Update CLAUDE.md with pipeline workflow documentation
