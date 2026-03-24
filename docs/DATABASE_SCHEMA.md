# Database Schema Reference

> Complete database schema for Gestelit Work Monitor
> Database: Supabase (PostgreSQL 17) with Row Level Security
> Last updated: March 2026

---

## Table of Contents

1. [Core Tables](#1-core-tables)
2. [Session & Status Tables](#2-session--status-tables)
3. [Pipeline Tables](#3-pipeline-tables)
4. [WIP Tracking Tables](#4-wip-tracking-tables)
5. [Report System Tables](#5-report-system-tables)
6. [Database Functions](#6-database-functions)
7. [Views](#7-views)
8. [Triggers](#8-triggers)
9. [Indexes](#9-indexes)
10. [Enums & Types](#10-enums--types)

---

## 1. Core Tables

### workers

Employee records for the manufacturing floor.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| worker_code | TEXT | NO | - | Unique login identifier |
| full_name | TEXT | NO | - | Display name |
| department | TEXT | YES | - | Department assignment |
| language | TEXT | YES | `'auto'` | UI language: `'he'`, `'ru'`, `'auto'` |
| role | worker_role | NO | `'worker'` | `'worker'` or `'admin'` |
| is_active | BOOLEAN | NO | `true` | Can login if true |
| created_at | TIMESTAMPTZ | NO | `now()` | |
| updated_at | TIMESTAMPTZ | NO | `now()` | |

**Constraints:**
- `workers_worker_code_key`: UNIQUE on `worker_code`

---

### stations

Manufacturing workstations/machines.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| code | TEXT | NO | - | Unique station code |
| name | TEXT | NO | - | Display name |
| station_type | TEXT | NO | `'other'` | Type classification |
| is_active | BOOLEAN | NO | `true` | Available for selection |
| start_checklist | JSONB | NO | `'[]'` | Pre-work checklist items |
| end_checklist | JSONB | NO | `'[]'` | Post-work checklist items |
| station_reasons | JSONB | NO | `'[]'` | Malfunction reason options |
| created_at | TIMESTAMPTZ | NO | `now()` | |
| updated_at | TIMESTAMPTZ | NO | `now()` | |

**Constraints:**
- `stations_code_key`: UNIQUE on `code`
- `station_type_check`: CHECK `station_type IN ('prepress', 'digital_press', 'offset', 'folding', 'cutting', 'binding', 'shrink', 'lamination', 'other')`

**JSONB Structures:**

Checklist item:
```json
{
  "id": "string",
  "label_he": "string",
  "label_ru": "string",
  "order_index": 0,
  "is_required": true
}
```

Station reason:
```json
{
  "id": "general-malfunction",
  "label_he": "תקלת כללית",
  "label_ru": "Общая неисправность",
  "is_active": true
}
```

---

### worker_stations

Many-to-many junction for worker-station assignments.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| worker_id | UUID | NO | - | FK -> workers.id |
| station_id | UUID | NO | - | FK -> stations.id |
| created_at | TIMESTAMPTZ | NO | `now()` | |

**Constraints:**
- `worker_stations_worker_id_station_id_key`: UNIQUE on `(worker_id, station_id)`

---

### jobs

Production jobs/orders.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| job_number | TEXT | NO | - | Unique job identifier |
| customer_name | TEXT | YES | - | Customer reference |
| description | TEXT | YES | - | Job description |
| planned_quantity | INTEGER | YES | - | Target quantity (legacy) |
| created_at | TIMESTAMPTZ | NO | `now()` | |
| updated_at | TIMESTAMPTZ | NO | `now()` | |

**Constraints:**
- `jobs_job_number_key`: UNIQUE on `job_number`

---

## 2. Session & Status Tables

### sessions

Worker session records tracking production work.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| worker_id | UUID | YES | - | FK -> workers.id (nullable for legacy) |
| station_id | UUID | YES | - | FK -> stations.id (nullable for legacy) |
| job_id | UUID | NO | - | FK -> jobs.id |
| job_item_id | UUID | YES | - | FK -> job_items.id (production line) |
| job_item_step_id | UUID | YES | - | FK -> job_item_steps.id (pipeline step) |
| status | session_status | NO | `'active'` | `'active'`, `'completed'`, `'aborted'` |
| current_status_id | UUID | NO | - | FK -> status_definitions.id (mirrored) |
| started_at | TIMESTAMPTZ | NO | `now()` | Session start time |
| ended_at | TIMESTAMPTZ | YES | - | Session end time |
| last_seen_at | TIMESTAMPTZ | NO | `timezone('utc', now())` | Last heartbeat |
| forced_closed_at | TIMESTAMPTZ | YES | - | Set when force-closed |
| last_status_change_at | TIMESTAMPTZ | NO | `timezone('utc', now())` | Status change timestamp |
| start_checklist_completed | BOOLEAN | NO | `false` | Pre-work done |
| end_checklist_completed | BOOLEAN | NO | `false` | Post-work done |
| active_instance_id | TEXT | YES | - | Browser tab ID (multi-tab prevention) |
| total_good | INTEGER | NO | `0` | Good units produced |
| total_scrap | INTEGER | NO | `0` | Scrap units |
| scrap_report_submitted | BOOLEAN | NO | `false` | Scrap report flag |
| worker_full_name_snapshot | TEXT | YES | - | Historical worker name |
| worker_code_snapshot | TEXT | YES | - | Historical worker code |
| station_name_snapshot | TEXT | YES | - | Historical station name |
| station_code_snapshot | TEXT | YES | - | Historical station code |
| created_at | TIMESTAMPTZ | NO | `now()` | |
| updated_at | TIMESTAMPTZ | NO | `now()` | |

**Important Notes:**
- `current_status_id` is a denormalized mirror of the latest status event for efficient queries
- Snapshot columns capture historical values at session creation for audit trails
- `job_item_id` and `job_item_step_id` enable pipeline tracking (NULL for legacy)
- Only one active session allowed per worker (enforced by partial unique index)

---

### status_definitions

Configurable status types for sessions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| scope | TEXT | NO | - | `'global'` or `'station'` |
| station_id | UUID | YES | - | FK -> stations.id (required if scope='station') |
| label_he | TEXT | NO | - | Hebrew label |
| label_ru | TEXT | YES | - | Russian label |
| color_hex | TEXT | NO | `'#94a3b8'` | Display color (15 allowed) |
| machine_state | TEXT | NO | - | `'production'`, `'setup'`, `'stoppage'` |
| report_type | TEXT | NO | `'none'` | `'none'`, `'malfunction'`, `'general'` |
| is_protected | BOOLEAN | NO | `false` | Cannot edit/delete if true |
| created_at | TIMESTAMPTZ | NO | `timezone('utc', now())` | |
| updated_at | TIMESTAMPTZ | NO | `timezone('utc', now())` | |

**Protected Statuses (cannot be modified):**

| label_he | label_ru | color_hex | machine_state | report_type |
|----------|----------|-----------|---------------|-------------|
| ייצור | Производство | #10b981 | production | none |
| תקלה | Неисправность | #ef4444 | stoppage | malfunction |
| עצירה | Остановка | #f97316 | stoppage | general |
| אחר | Другое | #94a3b8 | stoppage | general |

**Allowed Colors:**
```
#10b981, #f59e0b, #f97316, #ef4444, #3b82f6, #8b5cf6,
#06b6d4, #14b8a6, #84cc16, #eab308, #ec4899, #6366f1,
#0ea5e9, #64748b, #94a3b8
```

---

### status_events

Timeline of status changes within a session.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| session_id | UUID | NO | - | FK -> sessions.id |
| status_definition_id | UUID | NO | - | FK -> status_definitions.id |
| station_reason_id | TEXT | YES | - | Key into station.station_reasons |
| note | TEXT | YES | - | Contextual note |
| image_url | TEXT | YES | - | Uploaded image |
| report_id | UUID | YES | - | FK -> reports.id |
| started_at | TIMESTAMPTZ | NO | `now()` | Event start |
| ended_at | TIMESTAMPTZ | YES | - | NULL = currently active |
| created_at | TIMESTAMPTZ | NO | `now()` | |

**Notes:**
- Only one status event can have `ended_at IS NULL` per session
- `report_id` links the status event to a report (if applicable)

---

### checklist_responses

Records of completed checklist items.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| session_id | UUID | NO | - | FK -> sessions.id |
| station_id | UUID | NO | - | FK -> stations.id |
| checklist_kind | TEXT | NO | - | `'start'` or `'end'` |
| item_id | TEXT | NO | - | Checklist item identifier |
| checked | BOOLEAN | NO | - | Item completed |
| created_at | TIMESTAMPTZ | NO | `now()` | |

---

## 3. Pipeline Tables

### pipeline_presets

Reusable pipeline templates for production flows.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| name | TEXT | NO | - | Preset name |
| description | TEXT | YES | - | Optional description |
| is_active | BOOLEAN | NO | `true` | Available for use |
| created_at | TIMESTAMPTZ | NO | `now()` | |
| updated_at | TIMESTAMPTZ | NO | `now()` | |

---

### pipeline_preset_steps

Steps within a pipeline preset (station + position).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| pipeline_preset_id | UUID | NO | - | FK -> pipeline_presets.id (CASCADE) |
| station_id | UUID | NO | - | FK -> stations.id (RESTRICT) |
| position | INTEGER | NO | - | Order in pipeline (1-based) |
| created_at | TIMESTAMPTZ | NO | `now()` | |

Note: Stations CAN participate in multiple presets (no exclusivity constraint).

---

### job_items

Production units within a job.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| job_id | UUID | NO | - | FK -> jobs.id (CASCADE) |
| name | TEXT | NO | - | Product/item name |
| planned_quantity | INTEGER | NO | - | Target quantity (> 0) |
| pipeline_preset_id | UUID | YES | - | FK -> pipeline_presets.id (provenance) |
| is_pipeline_locked | BOOLEAN | NO | `false` | True after first production event |
| is_active | BOOLEAN | NO | `true` | Active item |
| created_at | TIMESTAMPTZ | NO | `now()` | |
| updated_at | TIMESTAMPTZ | NO | `now()` | |

Note: `is_pipeline_locked` becomes true after the first production session binds to this item, making the pipeline immutable.

---

### job_item_steps

Frozen snapshot of pipeline steps for each job item.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| job_item_id | UUID | NO | - | FK -> job_items.id (CASCADE) |
| station_id | UUID | NO | - | FK -> stations.id |
| position | INTEGER | NO | - | Step order (1-based) |
| is_terminal | BOOLEAN | NO | `false` | True for last station |
| created_at | TIMESTAMPTZ | NO | `now()` | |

Note: This is a SNAPSHOT of the pipeline at job item creation time. Changes to pipeline presets do not affect existing job items.

---

### job_item_progress

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| job_item_id | UUID | NO | - | PK, FK -> job_items.id (CASCADE) |
| completed_good | INTEGER | NO | `0` | Terminal station good output |
| completed_scrap | INTEGER | NO | `0` | Terminal station scrap output |
| updated_at | TIMESTAMPTZ | NO | `now()` | |

---

## 4. WIP Tracking Tables

### wip_balances

Per-step reported totals (independent station reporting model).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| job_item_id | UUID | NO | - | FK -> job_items.id (CASCADE) |
| job_item_step_id | UUID | NO | - | FK -> job_item_steps.id (CASCADE) |
| good_reported | INTEGER | NO | `0` | Total good units reported at this step |
| scrap_reported | INTEGER | NO | `0` | Total scrap units reported at this step |
| updated_at | TIMESTAMPTZ | NO | `now()` | |

**Constraints:**
- UNIQUE on `(job_item_id, job_item_step_id)`

---

## 5. Report System Tables

### reports

Unified reports table for malfunctions, general reports, and scrap.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| type | report_type_enum | NO | - | `'malfunction'`, `'general'`, `'scrap'` |
| status | report_status | NO | `'new'` | Current status |
| station_id | UUID | YES | - | FK -> stations.id |
| session_id | UUID | YES | - | FK -> sessions.id |
| status_event_id | UUID | YES | - | FK -> status_events.id |
| reported_by_worker_id | UUID | YES | - | FK -> workers.id |
| station_reason_id | TEXT | YES | - | For malfunctions |
| report_reason_id | UUID | YES | - | FK -> report_reasons.id |
| description | TEXT | YES | - | Details |
| image_url | TEXT | YES | - | Uploaded image |
| admin_notes | TEXT | YES | - | Admin comments |
| status_changed_at | TIMESTAMPTZ | YES | - | Last status change |
| status_changed_by | TEXT | YES | - | Who changed status |
| created_at | TIMESTAMPTZ | NO | `now()` | |
| updated_at | TIMESTAMPTZ | NO | `now()` | |

**Report Status Flows (enforced by trigger):**
- **Malfunction:** `open` -> `known` -> `solved`, or `open` -> `solved` directly, `solved` -> `open` (reopen)
- **General/Scrap:** `new` -> `approved` only (one-way, no backtrack)

---

### report_reasons

Global reasons for general reports (admin-configurable).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `gen_random_uuid()` | Primary key |
| label_he | TEXT | NO | - | Hebrew label |
| label_ru | TEXT | YES | - | Russian label |
| is_active | BOOLEAN | NO | `true` | Available for selection |
| sort_order | INTEGER | NO | `0` | Display order |
| created_at | TIMESTAMPTZ | NO | `now()` | |
| updated_at | TIMESTAMPTZ | NO | `now()` | |

---

## 6. Database Functions

### create_status_event_atomic

Atomically creates a status event and mirrors to session.

```sql
create_status_event_atomic(
  p_session_id UUID,
  p_status_definition_id UUID,
  p_station_reason_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_report_id UUID DEFAULT NULL
) RETURNS status_events
```

**Operations (single transaction):**
1. Close all open status events for session (`ended_at = now()`)
2. Insert new status event
3. Update `sessions.current_status_id` and `sessions.last_status_change_at`

**Why atomic?** Prevents race conditions when concurrent status updates occur.

---

### update_session_quantities_v6

Independent station reporting: increments good_reported/scrap_reported at the bound step.

```sql
update_session_quantities_v6(
  p_session_id UUID,
  p_good_delta INTEGER,
  p_scrap_delta INTEGER
) RETURNS void
```

**Behavior:**
- Increments good_reported and scrap_reported on the wip_balances row for the session's bound step
- If terminal station: also increments completed_good/completed_scrap in job_item_progress
- No upstream/downstream consumption logic

---

### end_production_status_atomic_v2

Ends production status with quantity reporting in one transaction.

```sql
end_production_status_atomic_v2(
  p_session_id UUID,
  p_status_event_id UUID,
  p_quantity_good INTEGER,
  p_quantity_scrap INTEGER,
  p_next_status_id UUID
) RETURNS JSONB
```

**Behavior:**
- Calls update_session_quantities_v6 with the quantity deltas
- Creates a new status event via create_status_event_atomic
- Returns the new status event data

---

### setup_job_item_pipeline

Creates job_item_steps from a station array.

```sql
setup_job_item_pipeline(
  p_job_item_id UUID,
  p_station_ids UUID[]
) RETURNS void
```

**Behavior:**
- Deletes existing steps for the job item
- Creates new job_item_steps with positions (1-indexed)
- Last station marked as is_terminal
- Creates wip_balances and job_item_progress rows

---

### bind_job_item_atomic / unbind_job_item_atomic

Binds/unbinds a job item step to a session atomically.

---

### rebuild_job_item_steps

Expands job item steps from pipeline configuration.

```sql
rebuild_job_item_steps(p_job_item_id UUID)
```

**Behavior:**
- Creates job_item_steps from the pipeline preset steps
- Ensures wip_balances rows exist for each step
- Ensures job_item_progress row exists

---

### get_jobs_with_stats

Returns jobs with aggregated session statistics.

```sql
get_jobs_with_stats() RETURNS TABLE (
  id UUID,
  job_number TEXT,
  customer_name TEXT,
  description TEXT,
  planned_quantity INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_good BIGINT,
  total_scrap BIGINT,
  session_count BIGINT
)
```

---

### Validation Functions

| Function | Purpose |
|----------|---------|
| `validate_checklist_jsonb(data JSONB)` | Validates checklist array structure |
| `validate_station_reasons_jsonb(data JSONB)` | Validates station_reasons array structure |
| `set_updated_at()` | Trigger function to update updated_at timestamp |
| `set_report_default_status()` | Sets initial status (malfunction->open, others->new) |
| `validate_report_transition()` | Enforces state machine for report status |

---

## 7. Views

No active views. The `v_session_wip_accounting` view was dropped as part of the independent station reporting refactor (March 2026).

---

## 8. Triggers

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| `report_set_default_status` | reports | BEFORE INSERT | `set_report_default_status()` |
| `report_state_transition_check` | reports | BEFORE UPDATE OF status | `validate_report_transition()` |
| `status_definitions_set_updated_at` | status_definitions | BEFORE UPDATE | `set_updated_at()` |
| `pipeline_presets_set_updated_at` | pipeline_presets | BEFORE UPDATE | `set_updated_at()` |
| `job_items_set_updated_at` | job_items | BEFORE UPDATE | `set_updated_at()` |
| `job_item_progress_set_updated_at` | job_item_progress | BEFORE UPDATE | `set_updated_at()` |
| `wip_balances_set_updated_at` | wip_balances | BEFORE UPDATE | `set_updated_at()` |

---

## 9. Indexes

### Sessions
```sql
sessions_current_status_idx ON (current_status_id)
sessions_job_idx ON (job_id)
sessions_started_at_idx ON (started_at)
sessions_station_idx ON (station_id)
sessions_status_idx ON (status)
sessions_worker_idx ON (worker_id)
sessions_station_occupancy_idx ON (station_id, status, last_seen_at)
  WHERE status = 'active' AND ended_at IS NULL AND forced_closed_at IS NULL
sessions_instance_validation_idx ON (id, active_instance_id)
  WHERE status = 'active'
sessions_unique_active_worker_idx ON (worker_id)
  WHERE status = 'active' AND ended_at IS NULL AND forced_closed_at IS NULL
```

### Status Events
```sql
status_events_session_idx ON (session_id)
status_events_malfunction_id_idx ON (report_id)
```

### Status Definitions
```sql
status_definitions_machine_state_idx ON (machine_state)
status_definitions_scope_idx ON (scope)
status_definitions_station_idx ON (station_id)
status_definitions_protected_idx ON (is_protected) WHERE is_protected = true
```

### Reports
```sql
reports_type_idx ON (type)
reports_status_idx ON (status)
reports_station_id_idx ON (station_id)
reports_session_id_idx ON (session_id)
reports_created_at_idx ON (created_at DESC)
reports_type_status_idx ON (type, status)
reports_status_event_id_idx ON (status_event_id)
```

### Pipeline & WIP
```sql
idx_pipeline_presets_active ON pipeline_presets(is_active)
idx_pps_preset ON pipeline_preset_steps(pipeline_preset_id)
idx_pps_station ON pipeline_preset_steps(station_id)
idx_job_items_job ON job_items(job_id)
idx_jis_job_item ON job_item_steps(job_item_id)
idx_jis_station ON job_item_steps(station_id)
idx_jis_terminal ON job_item_steps(job_item_id) WHERE is_terminal = true
idx_wip_balances_job_item ON wip_balances(job_item_id)
idx_wip_balances_step ON wip_balances(job_item_step_id)
```

---

## 10. Enums & Types

### session_status
```sql
'active' | 'completed' | 'aborted'
```

### worker_role
```sql
'worker' | 'admin'
```

### report_type_enum
```sql
'malfunction' | 'general' | 'scrap'
```

### report_status
```sql
'new' | 'approved' | 'open' | 'known' | 'solved'
```

### session_update_result (composite type)
```sql
(
  success BOOLEAN,
  error_code TEXT,
  session_id UUID,
  total_good INTEGER,
  total_scrap INTEGER
)
```

---

## Row Level Security

All tables have RLS enabled. API routes use service role key to bypass RLS:

```typescript
import { createServiceSupabase } from '@/lib/supabase/client';
const supabase = createServiceSupabase();
// This client bypasses RLS
```

RLS policies are defined in migration `20251215112227_enable_rls_policies.sql`.

---

## Migration Files Location

All migrations are in `supabase/migrations/` with timestamp prefixes (YYYYMMDDHHMMSS).

To apply migrations:
```bash
npx supabase db push
```

To create a new migration:
```bash
npx supabase migration new <migration_name>
```
