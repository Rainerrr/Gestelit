# Job System Overhaul - Implementation Plan

> **DB Restriction:** All database work MUST be executed only on Supabase branch project `yzpwxlgvfkkidjsphfzv`. Never apply migrations to main.

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Schema & Data Structure |
| Phase 2 | ✅ Complete | Admin UI - Pipeline Presets |
| Phase 3 | ✅ Complete | Worker Flow, Job/Item Selection & UI/UX |
| Phase 4 | ✅ Complete | Quantity Reporting & WIP Updates |
| Phase 5 | 🔲 Pending | Legacy Decommissioning |

## Summary

Transform the job system from production-line-based to pipeline-based architecture:
- **Job items** become master production units with custom names
- **Three modes**: Single-station, Production Line, OR Pipeline (custom or preset-based)
- **Stations** can participate in multiple pipelines across jobs (no exclusivity)
- **Pipeline presets** provide reusable templates
- **Custom pipelines** allow ad-hoc station sequences without preset
- **Pipelines lock** after production begins
- **Production lines are deprecated** and will be migrated to pipeline presets

## Key Architecture Decisions

| Decision | Choice |
|----------|--------|
| Column naming | Full rename: `job_item_station_id` → `job_item_step_id` everywhere |
| Station exclusivity | Removed - stations can be in multiple pipelines |
| Production lines | Deprecated - to be migrated to pipeline presets |
| UI style | Drag-and-drop flowchart with dnd-kit |
| Custom pipelines | Supported via `station_ids` array (no preset required) |

---

## Current State

| Table | Purpose | Status |
|-------|---------|--------|
| `job_items` | Links via `kind` enum to station OR production_line | **To be simplified** |
| `job_item_stations` | Frozen production steps | **Rename to `job_item_steps`** |
| `production_lines` | Reusable line templates | **DEPRECATED → migrate to presets** |
| `production_line_stations` | Stations in lines (exclusive) | **DEPRECATED** |

## Target State

| Table | Purpose |
|-------|---------|
| `job_items` | Master production unit with `name`, `planned_quantity`, optional `pipeline_preset_id` |
| `job_item_steps` | Pipeline steps for multi-station items (renamed from job_item_stations) |
| `pipeline_presets` | Reusable pipeline templates (replaces production_lines) |
| `pipeline_preset_steps` | Steps in presets (no station exclusivity) |
| `status_events` | Enhanced with `job_item_id`, `job_item_step_id` |

---

## Phase 1: Schema & Data Structure

### Migration 1A: Pipeline Presets (NEW)
```sql
-- File: 20260115000010_create_pipeline_presets.sql
CREATE TABLE pipeline_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pipeline_preset_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_preset_id UUID NOT NULL REFERENCES pipeline_presets(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Station can appear in MULTIPLE presets (no global unique on station_id)
  CONSTRAINT uq_preset_position UNIQUE (pipeline_preset_id, position),
  CONSTRAINT uq_preset_station UNIQUE (pipeline_preset_id, station_id)
);
```

### Migration 1B: Extend Job Items
```sql
-- File: 20260115000020_extend_job_items.sql
ALTER TABLE job_items ADD COLUMN name TEXT;
ALTER TABLE job_items ADD COLUMN pipeline_preset_id UUID REFERENCES pipeline_presets(id);
ALTER TABLE job_items ADD COLUMN is_pipeline_locked BOOLEAN NOT NULL DEFAULT false;

-- Remove the kind/station_id/production_line_id XOR constraint later in Phase 5
-- For now, add new columns alongside existing
```

### Migration 1C: Rename job_item_stations → job_item_steps
```sql
-- File: 20260115000030_rename_to_job_item_steps.sql
ALTER TABLE job_item_stations RENAME TO job_item_steps;

-- Rename constraint names
ALTER TABLE job_item_steps RENAME CONSTRAINT uq_jis_position TO uq_job_item_step_position;
ALTER TABLE job_item_steps RENAME CONSTRAINT uq_jis_station TO uq_job_item_step_station;

-- Rename indexes
ALTER INDEX idx_jis_job_item RENAME TO idx_job_item_steps_job_item;
ALTER INDEX idx_jis_station RENAME TO idx_job_item_steps_station;
ALTER INDEX idx_jis_terminal RENAME TO idx_job_item_steps_terminal;
```

### Migration 1D: Rename FK Columns Throughout
```sql
-- File: 20260115000040_rename_step_columns.sql

-- wip_balances
ALTER TABLE wip_balances RENAME COLUMN job_item_station_id TO job_item_step_id;

-- wip_consumptions
ALTER TABLE wip_consumptions RENAME COLUMN from_job_item_station_id TO from_job_item_step_id;

-- sessions
ALTER TABLE sessions RENAME COLUMN job_item_station_id TO job_item_step_id;
```

### Migration 1E: Extend Status Events
```sql
-- File: 20260115000050_extend_status_events.sql
ALTER TABLE status_events ADD COLUMN job_item_id UUID REFERENCES job_items(id);
ALTER TABLE status_events ADD COLUMN job_item_step_id UUID REFERENCES job_item_steps(id);

CREATE INDEX idx_status_events_job_item ON status_events(job_item_id) WHERE job_item_id IS NOT NULL;
CREATE INDEX idx_status_events_step ON status_events(job_item_step_id) WHERE job_item_step_id IS NOT NULL;
```

### Migration 1F: Pipeline Lock Trigger
```sql
-- File: 20260115000060_pipeline_lock_trigger.sql
CREATE OR REPLACE FUNCTION lock_job_item_pipeline_on_production()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_item_id IS NOT NULL THEN
    -- Check if status is production
    IF EXISTS (
      SELECT 1 FROM status_definitions
      WHERE id = NEW.status_definition_id AND machine_state = 'production'
    ) THEN
      UPDATE job_items SET is_pipeline_locked = true
      WHERE id = NEW.job_item_id AND is_pipeline_locked = false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lock_pipeline_on_production
  AFTER INSERT ON status_events
  FOR EACH ROW EXECUTE FUNCTION lock_job_item_pipeline_on_production();
```

### Migration 1G: Setup Pipeline RPC
```sql
-- File: 20260115000070_rpc_setup_pipeline.sql
CREATE OR REPLACE FUNCTION setup_job_item_pipeline(
  p_job_item_id UUID,
  p_station_ids UUID[],
  p_preset_id UUID DEFAULT NULL
) RETURNS VOID AS $$
-- Creates job_item_steps from station array
-- Sets is_terminal on last step
-- Creates wip_balance rows for each step
-- Creates job_item_progress row
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Migration 1H: Update WIP RPC (v3)
```sql
-- File: 20260115000080_update_wip_rpc_v3.sql
-- Update update_session_quantities_atomic to use job_item_step_id column name
CREATE OR REPLACE FUNCTION update_session_quantities_atomic_v3(...) ...
```

**Type definitions to update (`lib/types.ts`):**
```typescript
// NEW types
export interface PipelinePreset { id, name, description?, is_active }
export interface PipelinePresetStep { id, pipeline_preset_id, station_id, position, station? }
export interface PipelinePresetWithSteps extends PipelinePreset { steps: PipelinePresetStep[] }

// UPDATED types
export interface JobItem {
  // Existing
  id, job_id, kind, station_id?, production_line_id?, planned_quantity, is_active
  // NEW
  name: string;                    // Required custom name
  pipeline_preset_id?: string;     // Provenance reference
  is_pipeline_locked?: boolean;    // Lock after production
}

// RENAMED
export interface JobItemStep {     // was JobItemStation
  id, job_item_id, station_id, position, is_terminal, station?
}

export interface WipBalance {
  job_item_step_id: string;        // was job_item_station_id
}

export interface Session {
  job_item_step_id?: string;       // was job_item_station_id
}
```

---

## Phase 2: Admin UI - Pipeline Presets & Job Item Creation

### New Components

| Component | Path | Purpose |
|-----------|------|---------|
| `PipelinePresetsManagement` | `app/admin/manage/_components/pipeline-presets-management.tsx` | List/CRUD presets |
| `PipelineFlowchartEditor` | `app/admin/manage/_components/pipeline-flowchart-editor.tsx` | Visual node-based editor |
| `StationNode` | `app/admin/manage/_components/station-node.tsx` | Flowchart station node |

### Pipeline Flowchart Editor Features
- Visual node-based flow diagram
- Drag stations from palette onto canvas
- Connect nodes to define order
- Visual feedback for terminal station (last in flow)
- Read-only mode when `is_pipeline_locked = true`
- Station search/filter in palette

### Updated Components

| Component | Changes |
|-----------|---------|
| `JobItemFormDialog` | Add required `name` field, pipeline mode selector (single-station vs pipeline), integrate flowchart editor |
| `JobsManagement` | Show pipeline visualization in job item details |

### New API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/pipeline-presets` | GET | List all presets with steps |
| `/api/admin/pipeline-presets` | POST | Create preset with steps |
| `/api/admin/pipeline-presets/[id]` | PUT | Update preset metadata |
| `/api/admin/pipeline-presets/[id]` | DELETE | Delete preset (check not in use) |
| `/api/admin/pipeline-presets/[id]/steps` | PUT | Replace steps atomically |

### New Data Layer (`lib/data/pipeline-presets.ts`)

```typescript
export async function fetchAllPipelinePresets(options?: {
  includeInactive?: boolean;
  includeSteps?: boolean;
}): Promise<PipelinePresetWithSteps[]>;

export async function createPipelinePreset(payload: {
  name: string;
  description?: string;
  station_ids: string[];
}): Promise<PipelinePreset>;

export async function updatePipelinePreset(
  id: string,
  payload: Partial<{ name, description, is_active }>
): Promise<PipelinePreset>;

export async function updatePipelinePresetSteps(
  presetId: string,
  stationIds: string[]
): Promise<void>;

export async function deletePipelinePreset(id: string): Promise<void>;
```

### Updated Data Layer (`lib/data/job-items.ts`)

```typescript
// NEW function for creating job items with pipeline
export async function createJobItemWithPipeline(payload: {
  job_id: string;
  name: string;                    // Required
  planned_quantity: number;
  station_ids: string[];           // Pipeline stations (1 = single station, N = pipeline)
  preset_id?: string;              // Optional provenance
}): Promise<JobItemWithDetails>;

// Check if pipeline can be modified
export async function isJobItemPipelineLocked(jobItemId: string): Promise<boolean>;
```

---

## Phase 3: Worker Flow - Job/Item Selection

### Query Changes

The key change is how we find jobs available for a station. Currently this uses `production_line_stations` with station exclusivity. New approach:

```typescript
// lib/data/job-items.ts
export async function getAvailableJobsForStation(stationId: string) {
  // Query job_item_steps instead of production_line_stations
  // A job is available if ANY of its items has this station in its pipeline
  return supabase
    .from('job_item_steps')
    .select(`
      job_item:job_items!inner(
        id, name, planned_quantity, is_active,
        job:jobs!inner(id, job_number, customer_name)
      )
    `)
    .eq('station_id', stationId)
    .eq('job_item.is_active', true);
}
```

### Session Binding Updates

```typescript
// lib/data/sessions.ts
export async function bindJobItemToSession(
  sessionId: string,
  jobId: string,
  jobItemId: string,
  jobItemStepId: string          // renamed from jobItemStationId
): Promise<void>;
```

### Context Updates (`contexts/WorkerSessionContext.tsx`)

```typescript
export type ActiveJobItemContext = {
  id: string;
  jobId: string;
  name: string;                   // Now required
  plannedQuantity: number;
  jobItemStepId: string;          // renamed from jobItemStationId
  position: number;
  isTerminal: boolean;
};
```

### Files to Update
- `lib/data/job-items.ts` - Update queries to use `job_item_steps`
- `lib/data/sessions.ts` - Rename column references
- `lib/api/client.ts` - Update API wrapper types
- `contexts/WorkerSessionContext.tsx` - Rename fields
- `app/(worker)/work/_components/job-selection-dialog.tsx` - Use new types

---

## Phase 4: Quantity Reporting & WIP Updates

### Status Event Enhancement

Update `end_production_status_atomic` to record job item binding:

```sql
-- Parameters now include:
p_job_item_id UUID,
p_job_item_step_id UUID

-- Record on status event:
UPDATE status_events SET
  job_item_id = p_job_item_id,
  job_item_step_id = p_job_item_step_id,
  quantity_good = p_quantity_good,
  quantity_scrap = p_quantity_scrap,
  ended_at = now()
WHERE id = p_status_event_id;
```

### WIP Flow (unchanged logic, renamed columns)

1. **First station**: All GOOD is "originated" (created new)
2. **Subsequent stations**: Pull from upstream `wip_balances` when available
3. **Terminal station**: GOOD increments `job_item_progress.completed_good`
4. **Corrections**: LIFO reversal via `wip_consumptions` ledger

### Files to Update
- `supabase/migrations/` - New RPC versions
- `lib/data/sessions.ts` - Update function signatures

---

## Phase 5: Legacy Decommissioning + Pipeline-Only UI/UX Refactor

Phase 5 has two major parts:
1. **Part A: Database cleanup** - Remove legacy production line tables and columns
2. **Part B: UI/UX refactor** - Complete redesign treating PIPELINES as the only job item type

---

### Part A: Database Migration & Cleanup

#### Migration 5A: Migrate Production Lines to Pipeline Presets
```sql
-- File: 20260114000010_migrate_production_lines.sql

-- 1. Create pipeline presets from production_lines
INSERT INTO pipeline_presets (id, name, description, is_active)
SELECT id, name, 'Migrated from production line: ' || COALESCE(code, ''), is_active
FROM production_lines
ON CONFLICT (id) DO NOTHING;

-- 2. Create preset steps from production_line_stations
INSERT INTO pipeline_preset_steps (pipeline_preset_id, station_id, position)
SELECT production_line_id, station_id, position
FROM production_line_stations
ON CONFLICT DO NOTHING;

-- 3. Migrate existing job_items to pipeline model
UPDATE job_items SET kind = 'pipeline' WHERE kind IN ('station', 'line');

-- 4. Create job_item_steps for station-type items that don't have steps
INSERT INTO job_item_steps (job_item_id, station_id, position, is_terminal)
SELECT ji.id, ji.station_id, 1, true
FROM job_items ji
WHERE ji.station_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM job_item_steps jis WHERE jis.job_item_id = ji.id);

-- 5. Update names for items without names
UPDATE job_items ji SET name = COALESCE(
  ji.name,
  (SELECT pl.name FROM production_lines pl WHERE pl.id = ji.production_line_id),
  (SELECT s.name FROM stations s WHERE s.id = ji.station_id),
  'Pipeline Item'
) WHERE ji.name IS NULL;

-- 6. Make name NOT NULL
ALTER TABLE job_items ALTER COLUMN name SET NOT NULL;
```

#### Migration 5B: Remove Legacy Columns (after UI refactor)
```sql
-- File: 20260114000020_remove_legacy_schema.sql

-- Drop XOR constraint
ALTER TABLE job_items DROP CONSTRAINT IF EXISTS chk_job_item_xor;

-- Drop legacy columns
ALTER TABLE job_items DROP COLUMN IF EXISTS kind;
ALTER TABLE job_items DROP COLUMN IF EXISTS station_id;
ALTER TABLE job_items DROP COLUMN IF EXISTS production_line_id;

-- Drop legacy tables
DROP TABLE IF EXISTS production_line_stations;
DROP TABLE IF EXISTS production_lines;
```

---

### Part B: UI/UX Refactor - Pipeline-Only Design

#### Design Decisions

| Decision | Choice |
|----------|--------|
| Single stations | Treated as 1-station pipelines (same UI, simplified display) |
| Visual style | Horizontal flow (current), improved DnD responsiveness |
| Dialog sizing | More spacious dialogs for pipeline editor |
| Mobile experience | Simplified numbered list view instead of visual flow |
| Legacy lines | Full removal from UI |

#### Files to Refactor

| File | Changes |
|------|---------|
| `job-creation-wizard.tsx` | Remove kind toggle, pipeline-only flow, larger dialog |
| `job-items-dialog.tsx` | Remove kind toggle, unified pipeline editor, responsive |
| `pipeline-preset-steps-dialog.tsx` | Wider dialog, improved DnD touch targets |
| `jobs-management.tsx` | Remove production line references, pipeline-only display |
| `management-dashboard.tsx` | Remove production lines tab |

#### 5B.1: Job Creation Wizard Refactor

**Current:** 3-button toggle (station/line/pipeline)
**New:** Direct pipeline builder with preset loading

**Desktop Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Create Job                                          [X]    │
├─────────────────────────────────────────────────────────────┤
│  Step 1: Job Details                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Job Number: [__________]  Customer: [____________]  │   │
│  │ Description: [___________________________________ ] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Step 2: Products (Pipelines)                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Product Name: [____________]  Qty: [____]           │   │
│  │                                                     │   │
│  │ [Load from Preset ▼]  OR  [+ Add Station]           │   │
│  │                                                     │   │
│  │ ┌─────── Pipeline Flow ──────────────────────────┐  │   │
│  │ │  ┌────┐    ┌────┐    ┌────┐                   │  │   │
│  │ │  │ S1 │ →  │ S2 │ →  │ S3 │  (drag to reorder)│  │   │
│  │ │  │ ≡  │    │ ≡  │    │ ≡  │                   │  │   │
│  │ │  └────┘    └────┘    └────┘                   │  │   │
│  │ └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Cancel]                              [Create Job →]       │
└─────────────────────────────────────────────────────────────┘
```

**Mobile Layout:**
```
┌────────────────────────────┐
│ Create Job            [X]  │
├────────────────────────────┤
│ Product: Widget Assembly   │
│ Qty: 100                   │
│                            │
│ Pipeline Steps:            │
│ ┌────────────────────────┐ │
│ │ 1. Cutting       [≡][x]│ │
│ │ 2. Assembly      [≡][x]│ │
│ │ 3. QA Check      [≡][x]│ │
│ └────────────────────────┘ │
│                            │
│ [Load Preset ▼] [+ Add]    │
└────────────────────────────┘
```

**Key Changes:**
- Remove `newItemKind` state and 3-button toggle
- Always show pipeline flow editor
- Larger station cards (min-width: 100px → 120px)
- Better drag handles (larger touch targets)
- Responsive: horizontal on desktop, vertical list on mobile

#### 5B.2: Job Items Dialog Refactor

**Current:** Kind toggle + conditional rendering
**New:** Unified pipeline editor with inline editing

- Dialog max-width: `sm:max-w-4xl` (was `sm:max-w-2xl`)
- Remove kind selection entirely
- Show pipeline inline for existing items
- Collapsible pipeline view for completed items

#### 5B.3: Responsive Pipeline Flow Editor Component

Create a reusable `<PipelineFlowEditor>` component:

```typescript
// components/admin/pipeline-flow-editor.tsx

interface PipelineFlowEditorProps {
  stations: PipelineStation[];
  onStationsChange: (stations: PipelineStation[]) => void;
  availableStations: Station[];
  presets?: PipelinePreset[];
  onLoadPreset?: (presetId: string) => void;
  isLocked?: boolean;
  variant?: "compact" | "default" | "large";
}

// Features:
// - Horizontal flow on desktop (md+)
// - Vertical numbered list on mobile (<md)
// - Improved drag handles (24px touch targets)
// - Visual arrows between stations
// - First/last station indicators
```

**Breakpoint Behavior:**
- `<md`: Vertical list with numbered badges, drag handle on left
- `≥md`: Horizontal flow with arrows, drag handle on top

#### 5B.4: Management Dashboard Cleanup

**Current Tabs:** Jobs | Workers | Stations | Departments | Status Definitions | Production Lines | Pipeline Presets
**New Tabs:** Jobs | Workers | Stations | Departments | Status Definitions | Pipeline Presets

#### 5B.5: Type System Cleanup

```typescript
// lib/types.ts

// REMOVE
export type JobItemKind = "station" | "line" | "pipeline";

// UPDATE JobItem - remove kind, station_id, production_line_id
export interface JobItem {
  id: string;
  job_id: string;
  name: string;                    // Required
  planned_quantity: number;
  pipeline_preset_id?: string;     // Optional provenance reference
  is_pipeline_locked: boolean;
  is_active: boolean;
  created_at: string;
  // REMOVED: kind, station_id, production_line_id
}

// REMOVE entirely
export interface ProductionLine { ... }
export interface ProductionLineStation { ... }
export interface ProductionLineWithStations { ... }
```

#### 5B.6: API Cleanup

**Remove Routes:**
- `/api/admin/production-lines` (all methods)
- `/api/admin/production-lines/[id]` (all methods)
- `/api/admin/production-lines/[id]/stations`
- `/api/admin/production-lines/available-stations`

**Update Routes:**
- `POST /api/admin/jobs/[id]/items` - Only accept: `name`, `planned_quantity`, `station_ids[]`, `pipeline_preset_id?`

**Remove Data Functions:**
- `lib/data/production-lines.ts` (entire file)

---

### Phase 5 Implementation Order

1. **Database Migration (Part A)**
   - Apply migration 5A (migrate data, keep legacy columns)
   - Verify all job_items have `name` and `kind='pipeline'`
   - Verify all items have `job_item_steps`

2. **UI Refactor (Part B)**
   - Create shared `<PipelineFlowEditor>` component
   - Update `job-creation-wizard.tsx` - remove kind toggle
   - Update `job-items-dialog.tsx` - remove kind toggle, widen dialog
   - Update `pipeline-preset-steps-dialog.tsx` - improve DnD
   - Update `management-dashboard.tsx` - remove production lines tab
   - Update `jobs-management.tsx` - pipeline-only display

3. **Type/API Cleanup**
   - Update `lib/types.ts` - remove JobItemKind, ProductionLine types
   - Update `lib/api/admin-management.ts` - remove production line functions
   - Remove `lib/data/production-lines.ts`
   - Remove production line API routes

4. **Schema Cleanup**
   - Apply migration 5B (drop legacy columns/tables)

### Phase 5 Code Cleanup Checklist
- [ ] Remove `ProductionLine`, `ProductionLineStation` types from `lib/types.ts`
- [ ] Remove `JobItemKind` type from `lib/types.ts`
- [ ] Remove `lib/data/production-lines.ts`
- [ ] Remove production line admin components
- [ ] Remove production lines tab from management dashboard
- [ ] Remove kind toggle from job creation wizard
- [ ] Remove kind toggle from job items dialog
- [ ] Create reusable `PipelineFlowEditor` component
- [ ] Remove legacy query paths in job-items data layer
- [ ] Update all imports and references
- [ ] Delete `/api/admin/production-lines/*` routes

---

## Critical Files Summary

| File | Phase | Changes |
|------|-------|---------|
| `supabase/migrations/` | 1,5 | 10 new migrations (schema + RPCs) + 2 cleanup migrations |
| `lib/types.ts` | 1,5 | New types, rename JobItemStation→JobItemStep, remove legacy types |
| `lib/data/pipeline-presets.ts` | 2 | **NEW FILE** - Pipeline preset CRUD |
| `lib/data/job-items.ts` | 2,3 | Pipeline setup, `station_ids` support, query updates |
| `lib/data/sessions.ts` | 3 | Column renames |
| `lib/data/production-lines.ts` | 5 | **DELETE** - Remove legacy file |
| `lib/api/admin-management.ts` | 2,3,5 | Pipeline preset API, remove production line functions |
| `app/api/admin/pipeline-presets/` | 2 | **NEW ROUTES** - Full CRUD for presets |
| `app/api/admin/production-lines/` | 5 | **DELETE** - Remove all legacy routes |
| `app/api/admin/jobs/[id]/items/route.ts` | 3,5 | Pipeline-only (remove kind param) |
| `app/admin/manage/_components/pipeline-presets-management.tsx` | 2 | **NEW FILE** - Preset list/CRUD |
| `app/admin/manage/_components/pipeline-preset-form-dialog.tsx` | 2 | **NEW FILE** - Preset metadata editor |
| `app/admin/manage/_components/pipeline-preset-steps-dialog.tsx` | 2,3,5 | Improved DnD responsiveness |
| `app/admin/manage/_components/job-items-dialog.tsx` | 3,5 | **MAJOR REFACTOR** - Pipeline-only, wider dialog |
| `app/admin/manage/_components/job-creation-wizard.tsx` | 3,5 | **MAJOR REFACTOR** - Pipeline-only, remove kind toggle |
| `app/admin/manage/_components/jobs-management.tsx` | 3,5 | Pipeline-only display |
| `app/admin/manage/_components/management-dashboard.tsx` | 5 | Remove production lines tab |
| `components/admin/pipeline-flow-editor.tsx` | 5 | **NEW FILE** - Reusable responsive component |
| `contexts/WorkerSessionContext.tsx` | 3 | Rename jobItemStationId→jobItemStepId |

---

## Verification Plan

### Phase 1 Verification
```bash
# Apply migrations to branch project
npx supabase db push --db-url "postgres://...yzpwxlgvfkkidjsphfzv..."

# Verify new tables exist
SELECT * FROM pipeline_presets;
SELECT * FROM pipeline_preset_steps;

# Verify renamed table
SELECT * FROM job_item_steps;  -- was job_item_stations

# Verify new columns
SELECT name, pipeline_preset_id, is_pipeline_locked FROM job_items;
SELECT job_item_id, job_item_step_id FROM status_events;
```

### Phase 2 Verification
- [ ] Create pipeline preset via admin UI
- [ ] Verify flowchart editor allows station ordering
- [ ] Create job item with custom name using preset
- [ ] Create job item with custom single-station pipeline
- [ ] Verify job_item_steps created correctly

### Phase 3 Verification
- [ ] Worker at station sees jobs with items containing that station
- [ ] Bind job item updates session.job_item_step_id
- [ ] Context correctly shows job item name

### Phase 4 Verification
- [ ] Production status event records job_item_id and job_item_step_id
- [ ] Quantity reporting updates correct WIP balances
- [ ] Terminal station GOOD updates job_item_progress

### Phase 5 Verification

**Database:**
- [ ] All production_lines migrated to pipeline_presets
- [ ] All job_items have `name` NOT NULL
- [ ] All job_items have at least 1 job_item_step
- [ ] Legacy columns dropped without errors

**UI/UX:**
- [ ] Job creation wizard shows pipeline editor only (no kind toggle)
- [ ] Job items dialog shows pipeline editor only (no kind toggle)
- [ ] Pipeline flow editor works on mobile (vertical list)
- [ ] Pipeline flow editor works on desktop (horizontal flow)
- [ ] Drag-and-drop is responsive (no lag)
- [ ] Production lines tab removed from management dashboard
- [ ] All Hebrew labels correct

**API:**
- [ ] Production line routes return 404
- [ ] Job item creation works with `station_ids` only
- [ ] Build passes with no TypeScript errors

---

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Data loss from renames | High | Full backup before each migration |
| Breaking active sessions | High | Deploy during low-usage, keep legacy paths |
| WIP corruption | Medium | Audit log, reconciliation queries |
| UI build failures | Medium | Incremental component updates |

## Rollback Strategy

- **Phase 1**: Migrations are additive; can drop new columns/tables
- **Phase 2-4**: Old components kept until Phase 5
- **Phase 5**: Soft-delete production_lines for 30 days before hard delete

---

## Documentation Requirements

After completing each phase, create a summary document at:

```
docs/job-system-overhaul/phase-<n>-summary.md
```

Each phase summary MUST include:
- **Date completed**
- **Migrations applied** (list file names and brief descriptions)
- **Schema changes** (tables created/modified, columns added/renamed)
- **API changes** (new routes, modified endpoints)
- **UI changes** (new components, modified components)
- **Type changes** (new/modified TypeScript interfaces)
- **Breaking changes** (any backwards-incompatible changes)
- **Testing performed** (verification steps completed)
- **Known issues** (any problems discovered, workarounds applied)
- **Next steps** (what needs to happen in the following phase)

Example file structure after all phases:
```
docs/job-system-overhaul/
├── PLAN.md                    # This implementation plan
├── phase-1-summary.md         # Schema & Data Structure results ✅
├── phase-2-summary.md         # Admin UI results ✅
├── phase-3-summary.md         # Worker Flow & UI/UX results ✅
├── phase-4-summary.md         # Quantity Reporting results ✅
└── phase-5-summary.md         # Legacy Decommissioning results (pending)
```
