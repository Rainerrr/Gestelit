# Pipeline System - Implementation Specification

> Technical specification for the pipeline preset and independent station reporting system
> Originally authored: January 2026
> Last updated: March 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Business Rules](#2-business-rules)
3. [Database Schema](#3-database-schema)
4. [RPC Functions](#4-rpc-functions)
5. [API Endpoints](#5-api-endpoints)
6. [Worker Flow](#6-worker-flow)
7. [Admin Management](#7-admin-management)
8. [Real-Time Updates](#8-real-time-updates)
9. [Acceptance Tests](#9-acceptance-tests)

---

## 1. Overview

The pipeline system enables structured production tracking across multiple stations. It replaces the earlier consumption-based WIP model with **independent station reporting** -- each station reports its own good and scrap quantities independently, with no upstream/downstream consumption dependencies.

### Core Entities

| Entity | Purpose |
|--------|---------|
| Pipeline Preset | Reusable template defining an ordered station sequence |
| Pipeline Preset Step | Station + position within a preset |
| Job Item | Named production unit with planned quantity and optional preset |
| Job Item Step | Station position in a job item's pipeline (frozen copy of preset) |
| WIP Balance | Per-step reported totals (`good_reported`, `scrap_reported`) |
| Job Item Progress | Aggregated completion from terminal station |

### Design Principles

- **Independent reporting**: Each station reports its own quantities -- no consumption tracking
- **Terminal-only completion**: Only the terminal station's totals feed job item progress
- **Pipeline immutability**: Steps lock after first production event
- **Overproduction allowed**: No caps on reported quantities
- **Always selectable**: Job items remain selectable regardless of completion percentage
- **Atomicity**: All WIP and progress updates happen in PostgreSQL RPC functions

---

## 2. Business Rules

### 2.1 Scrap

- Scrap is tracked per station (`wip_balances.scrap_reported`) and per session
- Scrap at the terminal station feeds `job_item_progress.completed_scrap`
- Scrap counts toward completion: `completed_good + completed_scrap >= planned_quantity`

### 2.2 Quantity Reporting

- Workers report incremental quantities (good/scrap) at their bound station
- `update_session_quantities_v6()` increments `wip_balances` for the bound `job_item_step`
- If the step is terminal, also increments `job_item_progress`
- Session totals are per-job-item -- they reset when the worker switches job items

### 2.3 Job Completion

- Only the terminal station's totals determine completion
- Formula: `completed_good + completed_scrap >= planned_quantity`
- Completed job items remain selectable (overproduction allowed)

### 2.4 Pipeline Immutability

- `job_items.is_pipeline_locked` defaults to `false`
- Set to `true` after the first production event on any step
- Once locked: steps cannot be added, removed, or reordered
- The `pipeline_preset_id` on job items records provenance but steps are independent copies

### 2.5 Station Participation

- Stations can participate in multiple pipeline presets (no exclusivity constraint)
- Station availability for workers is filtered by which job items have steps at that station

---

## 3. Database Schema

### 3.1 Pipeline Presets

```sql
CREATE TABLE pipeline_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pipeline_preset_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_preset_id UUID NOT NULL REFERENCES pipeline_presets(id),
  station_id UUID NOT NULL REFERENCES stations(id),
  position INTEGER NOT NULL CHECK (position > 0),
  UNIQUE(pipeline_preset_id, position)
  -- No UNIQUE(station_id): stations can be in multiple presets
);
```

### 3.2 Job Items

```sql
CREATE TABLE job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id),
  name TEXT NOT NULL,
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
  pipeline_preset_id UUID NULL REFERENCES pipeline_presets(id),
  is_pipeline_locked BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.3 Job Item Steps

```sql
CREATE TABLE job_item_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_item_id UUID NOT NULL REFERENCES job_items(id),
  station_id UUID NOT NULL REFERENCES stations(id),
  position INTEGER NOT NULL,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(job_item_id, position),
  UNIQUE(job_item_id, station_id)
);
```

### 3.4 WIP Balances

```sql
CREATE TABLE wip_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_item_id UUID NOT NULL REFERENCES job_items(id),
  job_item_step_id UUID NOT NULL REFERENCES job_item_steps(id),
  good_reported INTEGER NOT NULL DEFAULT 0 CHECK (good_reported >= 0),
  scrap_reported INTEGER NOT NULL DEFAULT 0 CHECK (scrap_reported >= 0),
  UNIQUE(job_item_id, job_item_step_id)
);
```

### 3.5 Job Item Progress

```sql
CREATE TABLE job_item_progress (
  job_item_id UUID PRIMARY KEY REFERENCES job_items(id),
  completed_good INTEGER NOT NULL DEFAULT 0 CHECK (completed_good >= 0),
  completed_scrap INTEGER NOT NULL DEFAULT 0 CHECK (completed_scrap >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.6 Session Binding

Sessions bind to job item steps via:

```sql
-- Column on sessions table
sessions.job_item_step_id UUID NULL REFERENCES job_item_steps(id)
```

### 3.7 Entity Relationships

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

## 4. RPC Functions

### 4.1 `setup_job_item_pipeline(p_job_item_id UUID, p_station_ids UUID[])`

Creates `job_item_steps` from a station array:
- Creates one step per station with sequential positions
- Marks the last step as `is_terminal = true`
- Creates corresponding `wip_balances` rows (initialized to 0)
- Creates `job_item_progress` row if missing

### 4.2 `update_session_quantities_v6(p_session_id UUID, p_good_increment INT, p_scrap_increment INT)`

Independent quantity reporting:
1. Locks the session row (`SELECT ... FOR UPDATE`)
2. Increments `wip_balances.good_reported` and `scrap_reported` for the bound step
3. If the step is terminal: also increments `job_item_progress.completed_good` and `completed_scrap`
4. Updates session totals

Error conditions:
- `INVALID_SESSION_STEP`: session has no `job_item_step_id` bound

### 4.3 `end_production_status_atomic_v2(p_session_id UUID, p_good_increment INT, p_scrap_increment INT)`

Combines ending production status with a final quantity report:
1. Calls `update_session_quantities_v6()` internally
2. Closes the current production status event
3. Updates session status mirroring

### 4.4 `bind_job_item_atomic(p_session_id UUID, p_job_item_step_id UUID)`

Binds a session to a specific job item step:
- Sets `sessions.job_item_step_id`
- Sets `is_pipeline_locked = true` on the job item (first production event)

### 4.5 `unbind_job_item_atomic(p_session_id UUID)`

Unbinds a session from its current job item:
- Clears `sessions.job_item_step_id`
- Resets session totals for the job item context

### 4.6 `get_jobs_with_stats()`

Aggregates job data for admin views:
- Returns jobs with item counts, session totals
- Includes `completed_good`, `completed_scrap` from progress
- Scrap counts toward completion percentage

---

## 5. API Endpoints

### 5.1 Worker APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sessions/available-jobs` | GET | Job items with steps at a station |
| `/api/sessions` | POST | Create session |
| `/api/sessions/bind-job-item` | POST | Bind session to job item step |
| `/api/sessions/unbind-job-item` | POST | Unbind session from job item |
| `/api/sessions/pipeline/stream` | GET | SSE: real-time pipeline WIP updates |
| `/api/status-events/end-production` | POST | End production with final quantities |

### 5.2 Admin APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/manage/pipeline-presets` | GET/POST | List/create pipeline presets |
| `/api/admin/manage/jobs` | GET/POST | List/create jobs with items |
| `/api/admin/dashboard/job-progress` | GET | Job progress data |
| `/api/admin/dashboard/job-progress/stream` | GET | SSE: live job progress updates |

---

## 6. Worker Flow

### 6.1 Sequence

```
1. Worker ID (login)
2. Station selection
3. Job item selection (items with steps at chosen station)
4. Start checklist (optional)
5. Active work: status events, quantity reporting
6. End checklist (optional)
7. Session complete
```

### 6.2 Station Filtering

The station list shows only stations that have job item steps. Workers see job items filtered to those with a step at their selected station.

### 6.3 Job Item Binding

```typescript
// Worker selects job item -> system binds to the step at their station
POST /api/sessions/bind-job-item
{ sessionId: "uuid", jobItemStepId: "uuid" }

// Session now tracks: sessions.job_item_step_id
```

### 6.4 Quantity Reporting

Workers report incremental quantities during production:

```typescript
// Via quantity report dialog or end-production
POST /api/status-events/end-production
{
  sessionId: "uuid",
  good: 10,    // increment
  scrap: 1     // increment
}
```

### 6.5 Job Item Switching

Workers can switch job items during a session:
1. Unbind current job item (session totals reset)
2. Bind new job item step
3. Continue reporting on the new item

---

## 7. Admin Management

### 7.1 Pipeline Presets

Managed via `/admin/manage` in the Pipeline Presets tab:

```typescript
POST /api/admin/manage/pipeline-presets
{
  name: "Book Binding",
  description: "Full book binding workflow",
  steps: [
    { stationId: "uuid", position: 1 },
    { stationId: "uuid", position: 2 },
    { stationId: "uuid", position: 3 }
  ]
}
```

### 7.2 Jobs with Items

```typescript
POST /api/admin/manage/jobs
{
  jobNumber: "JOB-123",
  items: [
    {
      name: "Cover Plates",
      plannedQuantity: 1000,
      pipelinePresetId: "uuid"  // optional
    }
  ]
}
```

When `pipelinePresetId` is provided, the system calls `setup_job_item_pipeline()` to create steps.

---

## 8. Real-Time Updates

### 8.1 Worker Pipeline Stream

```typescript
GET /api/sessions/pipeline/stream?sessionId=uuid

// Emits events when wip_balances change for the current job item
// Used by PipelineContext to update pipeline display
```

### 8.2 Admin Job Progress Stream

```typescript
GET /api/admin/dashboard/job-progress/stream

// Emits events when job_item_progress or wip_balances change
// Used by LiveJobProgress component on admin dashboard
```

Both streams use Supabase Realtime subscriptions server-side, emitting typed SSE events (`initial`, `update`, `insert`, `delete`).

---

## 9. Acceptance Tests

### Station Selection & Permissions
1. Available-jobs endpoint returns only items with steps at the requested station
2. Session binding rejects steps not at the worker's station
3. Sessions without job item bindings continue to work (legacy support)

### Quantity Reporting
4. Reporting increments `wip_balances.good_reported` and `scrap_reported`
5. Terminal station reporting also increments `job_item_progress`
6. Non-terminal station reporting does not affect `job_item_progress`
7. Overproduction beyond `planned_quantity` is allowed

### Pipeline Immutability
8. First bind sets `is_pipeline_locked = true`
9. Locked pipelines reject step modifications
10. Unlocked pipelines allow step rebuilds

### Job Completion
11. Completion calculated as `(completed_good + completed_scrap) / planned_quantity`
12. Completed job items remain selectable
13. Scrap at terminal station counts toward completion

### Session Totals
14. Session totals track quantities per job item
15. Switching job items resets session totals
16. Unbinding clears session's job item step reference

### Data Integrity
17. WIP balances never go negative (`CHECK` constraints)
18. Job item progress never goes negative (`CHECK` constraints)
19. Pipeline preset steps allow same station in multiple presets

---

## Data Layer

| File | Purpose |
|------|---------|
| `lib/data/pipeline-presets.ts` | Pipeline preset CRUD, step management |
| `lib/data/job-items.ts` | Job item queries, available jobs for station, WIP balances |
| `lib/data/jobs.ts` | Job CRUD, aggregation with stats |
| `lib/data/sessions.ts` | Session lifecycle, binding operations |

## Related Documentation

- [PRODUCTION_LINES.md](./PRODUCTION_LINES.md) - Feature overview and concepts
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Complete database tables and functions
- [API_REFERENCE.md](./API_REFERENCE.md) - Full API endpoint reference
- [WORKER_FLOW.md](./WORKER_FLOW.md) - Worker application flow details
- [REALTIME_STREAMING.md](./REALTIME_STREAMING.md) - SSE stream architecture
