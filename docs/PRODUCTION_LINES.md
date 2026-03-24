# Pipeline System & WIP Tracking

> Pipeline preset system with independent station reporting and WIP tracking
> Feature added: January 2026
> Last updated: March 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Concepts](#2-concepts)
3. [Database Schema](#3-database-schema)
4. [Independent Reporting Model](#4-independent-reporting-model)
5. [Worker Flow](#5-worker-flow)
6. [Quantity Updates](#6-quantity-updates)
7. [Admin Management](#7-admin-management)
8. [Live Progress Tracking](#8-live-progress-tracking)
9. [API Reference](#9-api-reference)

---

## 1. Overview

The pipeline system enables:
- **Pipeline presets**: Reusable templates defining ordered station sequences
- **Job items**: Named production units with planned quantities and optional preset association
- **Independent reporting**: Each station reports its own good/scrap quantities independently
- **Completion tracking**: Terminal station totals determine job item completion
- **Overproduction support**: No caps on reported quantities

### Key Benefits
- Real-time visibility into production progress at every station
- Simple reporting model with no upstream/downstream dependencies
- Stations can participate in multiple pipeline presets (no exclusivity)
- Pipeline immutability after first production event ensures data integrity

---

## 2. Concepts

### Pipeline Preset
A reusable template defining an ordered sequence of stations. Stations can belong to multiple presets.

```
Pipeline Preset: "Book Binding"
  Position 1: Printing Station
  Position 2: Folding Station
  Position 3: Binding Station (terminal)
```

### Job Item
A named production unit within a job. Each job item has a `name`, `planned_quantity`, and an optional `pipeline_preset_id` recording which preset was used to create its steps.

### Job Item Step
A station position in a job item's pipeline. Created from a pipeline preset (or manually). Steps become immutable once `is_pipeline_locked` is set to true after the first production event.

### WIP Balances
Per-step reported totals tracking `good_reported` and `scrap_reported` independently.

```
[Station 1]           [Station 2]           [Station 3]
good_reported: 150    good_reported: 100    good_reported: 50
scrap_reported: 5     scrap_reported: 3     scrap_reported: 1
                                            (terminal)
```

### Terminal Station
Last station in a pipeline. Its totals feed `job_item_progress.completed_good` and `completed_scrap`, which determine overall job item completion.

### Completion
A job item is considered complete when:
```
completed_good + completed_scrap >= planned_quantity
```

---

## 3. Database Schema

### pipeline_presets
```sql
CREATE TABLE pipeline_presets (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN DEFAULT true
);
```

### pipeline_preset_steps
```sql
CREATE TABLE pipeline_preset_steps (
  id UUID PRIMARY KEY,
  pipeline_preset_id UUID REFERENCES pipeline_presets(id),
  station_id UUID REFERENCES stations(id),
  position INTEGER NOT NULL CHECK (position > 0)

  -- No UNIQUE(station_id) constraint: stations can be in multiple presets
);
```

### job_items
```sql
CREATE TABLE job_items (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  name TEXT NOT NULL,
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
  pipeline_preset_id UUID NULL REFERENCES pipeline_presets(id),
  is_pipeline_locked BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true
);
```

### job_item_steps
```sql
CREATE TABLE job_item_steps (
  id UUID PRIMARY KEY,
  job_item_id UUID REFERENCES job_items(id),
  station_id UUID REFERENCES stations(id),
  position INTEGER NOT NULL,
  is_terminal BOOLEAN DEFAULT false
);
```

### job_item_progress
```sql
CREATE TABLE job_item_progress (
  job_item_id UUID PRIMARY KEY REFERENCES job_items(id),
  completed_good INTEGER DEFAULT 0 CHECK (completed_good >= 0),
  completed_scrap INTEGER DEFAULT 0 CHECK (completed_scrap >= 0)
);
```

### wip_balances
```sql
CREATE TABLE wip_balances (
  id UUID PRIMARY KEY,
  job_item_id UUID REFERENCES job_items(id),
  job_item_step_id UUID REFERENCES job_item_steps(id),
  good_reported INTEGER DEFAULT 0 CHECK (good_reported >= 0),
  scrap_reported INTEGER DEFAULT 0 CHECK (scrap_reported >= 0)
);
```

### Entity Relationships

```
pipeline_presets          job_items                  job_item_steps
+- id                     +- id                      +- id
+- name                   +- job_id                  +- job_item_id
+- description            +- name (required)         +- station_id
+- is_active              +- planned_quantity        +- position
+- pipeline_preset_steps  +- pipeline_preset_id?     +- is_terminal
   +- station_id          +- is_pipeline_locked      +- wip_balances
   +- position            +- is_active                  +- good_reported
                                                        +- scrap_reported

job_item_progress
+- job_item_id (PK)
+- completed_good
+- completed_scrap
```

---

## 4. Independent Reporting Model

### How It Works
Each station reports its own production quantities independently. There is no upstream/downstream consumption tracking.

1. **All stations** increment `good_reported` and `scrap_reported` in their `wip_balances` row
2. **Terminal station** totals additionally feed `job_item_progress.completed_good` and `completed_scrap`
3. **Overproduction** is allowed -- no caps on reported quantities
4. **Job items** remain selectable regardless of completion percentage

### Example

```
Job Item: "Cover Plates" (planned_quantity: 1000)

Station 1 (Cutting):    good_reported = 500, scrap_reported = 10
Station 2 (Polishing):  good_reported = 400, scrap_reported = 5
Station 3 (Packaging):  good_reported = 300, scrap_reported = 2  [terminal]

job_item_progress:
  completed_good = 300   (from terminal station)
  completed_scrap = 2    (from terminal station)

Completion: (300 + 2) / 1000 = 30.2%
```

### Session Totals vs Job Progress
- **Session totals**: Per-session quantities tracked in WorkerSessionContext (`good`, `scrap`)
- **Job item progress**: Aggregated across all sessions at the terminal station
- Session totals reset when the worker switches to a different job item

---

## 5. Worker Flow

### Station Selection
Worker selects a station, then the system shows available job items at that station.

```typescript
// Worker logs in with worker code
// Worker selects their station
// System fetches available job items for that station

GET /api/sessions/available-jobs?stationId=uuid

// Response includes job items that have a step at this station:
{
  jobItems: [
    {
      jobItemId: "uuid",
      jobItemStepId: "uuid",
      jobName: "JOB-123",
      itemName: "Cover Plates",
      plannedQuantity: 1000,
      completedGood: 300,
      completedScrap: 2,
      position: 2,
      isTerminal: false
    }
  ]
}
```

### Job Item Binding
When a worker enters production, their session binds to a specific job item step.

```typescript
// Binding happens via RPC
bind_job_item_atomic(
  p_session_id UUID,
  p_job_item_step_id UUID
)

// Session now tracks:
sessions.job_item_step_id  -- FK to job_item_steps (current step)
```

### Unbinding
Workers can switch job items during a session. The previous binding is cleared and a new one established.

```typescript
// Unbinding via RPC
unbind_job_item_atomic(
  p_session_id UUID
)
```

---

## 6. Quantity Updates

### RPC Function
```sql
update_session_quantities_v6(
  p_session_id UUID,
  p_good_increment INTEGER,
  p_scrap_increment INTEGER
)
```

### Reporting Flow

```
Worker reports quantities at their station:

1. Increment good_reported on wip_balances for this job_item_step
2. Increment scrap_reported on wip_balances for this job_item_step
3. If terminal station:
   - Also increment completed_good on job_item_progress
   - Also increment completed_scrap on job_item_progress
4. Update session totals
```

### End Production with Quantities
```sql
end_production_status_atomic_v2(
  p_session_id UUID,
  p_good_increment INTEGER,
  p_scrap_increment INTEGER
)
```

This function combines ending the production status with a final quantity report. It calls `update_session_quantities_v6()` internally before closing the production status event.

---

## 7. Admin Management

### Create Pipeline Preset

Pipeline presets are managed via `/admin/manage` in the Pipeline Presets tab.

```typescript
POST /api/admin/manage/pipeline-presets
{
  name: "Book Binding",
  description: "Full book binding workflow",
  steps: [
    { stationId: "station1-uuid", position: 1 },
    { stationId: "station2-uuid", position: 2 },
    { stationId: "station3-uuid", position: 3 }
  ]
}
```

Stations can appear in multiple presets -- there is no exclusivity constraint.

### Create Job with Items

Jobs and job items are managed via `/admin/manage` in the Jobs tab.

```typescript
POST /api/admin/manage/jobs
{
  jobNumber: "JOB-123",
  items: [
    {
      name: "Cover Plates",
      plannedQuantity: 1000,
      pipelinePresetId: "preset-uuid"  // optional
    }
  ]
}
```

When a `pipelinePresetId` is provided, the system uses `setup_job_item_pipeline()` to create `job_item_steps` from the preset's stations.

### Pipeline Immutability

Once the first production event occurs on a job item, `is_pipeline_locked` is set to `true`. After locking:
- Steps cannot be added, removed, or reordered
- The pipeline preset association is recorded for provenance but the steps are independent copies

### Rebuild Steps

```sql
-- Recreate steps from a new station array (only when pipeline is unlocked)
rebuild_job_item_steps(p_job_item_id UUID, p_station_ids UUID[])
```

---

## 8. Live Progress Tracking

### Job Progress API

```typescript
GET /api/admin/dashboard/job-progress

{
  jobs: [
    {
      id: "uuid",
      job_number: "JOB-123",
      items: [
        {
          id: "uuid",
          name: "Cover Plates",
          planned_quantity: 1000,
          completed_good: 300,
          completed_scrap: 2,
          steps: [
            {
              station_id: "uuid",
              station_name: "Cutting",
              position: 1,
              is_terminal: false,
              good_reported: 500,
              scrap_reported: 10
            },
            {
              station_id: "uuid",
              station_name: "Packaging",
              position: 3,
              is_terminal: true,
              good_reported: 300,
              scrap_reported: 2
            }
          ]
        }
      ]
    }
  ]
}
```

### Real-Time Updates

Pipeline WIP balances stream to workers via SSE:

```typescript
GET /api/sessions/pipeline/stream?sessionId=uuid

// Emits events when wip_balances change for the current job item
// Used by PipelineContext to update the pipeline display in real time
```

Admin dashboard receives job progress updates via:

```typescript
GET /api/admin/dashboard/job-progress/stream

// Emits events when job_item_progress or wip_balances change
```

---

## 9. API Reference

### Worker APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sessions/available-jobs` | GET | Job items available at station |
| `/api/sessions` | POST | Create session |
| `/api/sessions/bind-job-item` | POST | Bind session to job item step |
| `/api/sessions/unbind-job-item` | POST | Unbind session from job item |
| `/api/sessions/pipeline/stream` | GET | Real-time pipeline WIP updates |
| `/api/status-events/end-production` | POST | End production with quantities |

### Admin APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/manage/pipeline-presets` | GET/POST | List/create presets |
| `/api/admin/manage/jobs` | GET/POST | List/create jobs with items |
| `/api/admin/dashboard/job-progress` | GET | Live job progress |
| `/api/admin/dashboard/job-progress/stream` | GET | SSE job progress stream |

### Data Layer

| File | Purpose |
|------|---------|
| `lib/data/pipeline-presets.ts` | Pipeline preset CRUD, step management |
| `lib/data/job-items.ts` | Job item queries, available jobs for station, WIP balances |
| `lib/data/jobs.ts` | Job CRUD, aggregation for admin |
| `lib/data/sessions.ts` | Session lifecycle operations |

### RPC Functions

| Function | Purpose |
|----------|---------|
| `setup_job_item_pipeline(job_item_id, station_ids)` | Create steps from station array |
| `rebuild_job_item_steps(job_item_id)` | Recreate steps (unlocked pipelines only) |
| `update_session_quantities_v6(session_id, good_inc, scrap_inc)` | Independent quantity reporting |
| `end_production_status_atomic_v2(session_id, good_inc, scrap_inc)` | End production with final quantities |
| `bind_job_item_atomic(session_id, job_item_step_id)` | Bind session to job item step |
| `unbind_job_item_atomic(session_id)` | Unbind session from job item |

---

## Key Business Rules

1. **Stations in multiple presets**: A station can participate in any number of pipeline presets
2. **Pipeline immutability**: Steps are locked after first production event (`is_pipeline_locked`)
3. **Independent reporting**: Each station reports its own good/scrap independently
4. **Terminal-only completion**: Only terminal station totals feed job item progress
5. **Overproduction allowed**: No caps on reported quantities at any station
6. **Always selectable**: Job items remain selectable regardless of completion percentage
7. **Session totals per job item**: Totals reset when worker switches job items
8. **Preset provenance**: `pipeline_preset_id` on job items records which preset was used, but steps are independent copies
