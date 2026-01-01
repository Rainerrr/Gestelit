# Gestelit Work Monitor - Architecture Reference

> Manufacturing floor real-time worker session tracking system
> Stack: Next.js 16 + React 19 + TypeScript + Supabase (PostgreSQL)
> Updated: January 2026

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [System Overview](#2-system-overview)
3. [Database Schema](#3-database-schema)
4. [Data Management Patterns](#4-data-management-patterns)
5. [Application Architecture](#5-application-architecture)
6. [API Layer](#6-api-layer)
7. [Security Model](#7-security-model)
8. [Testing Strategy](#8-testing-strategy)
9. [Conventions](#9-conventions)

---

## 1. Quick Reference

### Commands
```bash
npm run dev       # Development server (localhost:3000)
npm run build     # Production build
npm run lint      # ESLint check
npm run test:run  # Run integration tests
npx supabase db push  # Apply migrations to remote
```

### Key Directories
```
app/(worker)/          # Worker flow: login -> station -> job -> checklist -> work
app/admin/             # Admin dashboard, history, reports, management
app/api/               # Backend API routes (service role)
lib/data/              # Server-side Supabase queries (reusable)
lib/api/               # Client-side API wrappers (auth headers)
lib/types.ts           # TypeScript domain types
contexts/              # React contexts (WorkerSession, Language)
hooks/                 # Custom React hooks
tests/integration/     # Vitest integration tests
supabase/migrations/   # Database migrations (timestamped)
```

---

## 2. System Overview

### Domain Model

```
                    ┌─────────────┐
                    │   Workers   │
                    │ (employees) │
                    └──────┬──────┘
                           │ works on
                           ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Stations  │◄────│   Sessions  │────►│    Jobs     │
│ (machines)  │     │ (work unit) │     │  (orders)   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │  Status  │  │ Checklist│  │  Reports │
       │  Events  │  │ Responses│  │(issues)  │
       └──────────┘  └──────────┘  └──────────┘
```

### Core Domain Types
```typescript
SessionStatus: "active" | "completed" | "aborted"
MachineState: "production" | "setup" | "stoppage"
StatusScope: "global" | "station"
ReportType: "malfunction" | "general" | "scrap"
ReportStatus: "open" | "known" | "solved" | "new" | "approved"
ChecklistKind: "start" | "end"
```

### Session Lifecycle

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  Login  │───►│ Station │───►│   Job   │───►│  Start  │───►│  Work   │───►│Complete │
│ (code)  │    │ Select  │    │  Entry  │    │Checklist│    │ (active)│    │   End   │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └────┬────┘    └─────────┘
                                                                  │
                              ┌───────────────────────────────────┤
                              │                                   │
                              ▼                                   ▼
                    ┌──────────────────┐              ┌──────────────────┐
                    │  Heartbeat (15s) │              │  Grace Period    │
                    │  last_seen_at    │              │  (5 min recovery)│
                    └──────────────────┘              └──────────────────┘
```

**Key Behaviors:**
- Single active session per worker (enforced)
- Station occupancy tracking (one session per station)
- Instance tracking prevents multi-tab conflicts
- Idle sessions auto-closed after 5 minutes
- 5-minute grace period allows session recovery

---

## 3. Database Schema

### Entity Relationship Diagram

```
┌─────────────────────┐       ┌─────────────────────┐
│      workers        │       │      stations       │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │
│ worker_code (UNIQUE)│       │ code (UNIQUE)       │
│ full_name           │       │ name                │
│ department          │       │ station_type        │
│ language            │       │ is_active           │
│ role                │       │ start_checklist     │◄── JSONB
│ is_active           │       │ end_checklist       │◄── JSONB
└─────────┬───────────┘       │ station_reasons     │◄── JSONB
          │                   └─────────┬───────────┘
          │                             │
          │    ┌────────────────────────┤
          │    │                        │
          ▼    ▼                        ▼
┌─────────────────────┐       ┌─────────────────────┐
│  worker_stations    │       │ status_definitions  │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │
│ worker_id (FK)      │       │ scope (global/station)
│ station_id (FK)     │       │ station_id (FK,NULL)│
└─────────────────────┘       │ label_he, label_ru  │
                              │ color_hex           │◄── 15-color palette
                              │ machine_state       │◄── production/setup/stoppage
                              │ report_type         │◄── none/malfunction/general
                              │ is_protected        │
                              └─────────┬───────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          │                             │                             │
          ▼                             ▼                             ▼
┌─────────────────────┐       ┌─────────────────────┐       ┌─────────────────────┐
│       jobs          │       │      sessions       │       │   status_events     │
├─────────────────────┤       ├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │◄──────│ id (PK)             │◄──────│ id (PK)             │
│ job_number (UNIQUE) │       │ worker_id (FK)      │       │ session_id (FK)     │
│ customer_name       │       │ station_id (FK)     │       │ status_definition_id│
│ description         │       │ job_id (FK)         │       │ station_reason_id   │
│ planned_quantity    │       │ status              │       │ note                │
└─────────────────────┘       │ current_status_id   │◄──┐   │ image_url           │
                              │ started_at          │   │   │ report_id (FK)      │
                              │ ended_at            │   │   │ started_at          │
                              │ last_seen_at        │   │   │ ended_at            │
                              │ forced_closed_at    │   │   └─────────────────────┘
                              │ last_status_change_at   │
                              │ active_instance_id  │   └── Status Mirroring
                              │ total_good          │
                              │ total_scrap         │
                              │ scrap_report_submitted
                              │ *_snapshot columns  │◄── Historical snapshots
                              └─────────────────────┘
                                        │
                                        ▼
┌─────────────────────┐       ┌─────────────────────┐       ┌─────────────────────┐
│checklist_responses  │       │      reports        │       │   report_reasons    │
├─────────────────────┤       ├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │       │ id (PK)             │
│ session_id (FK)     │       │ type (enum)         │◄──────│ label_he, label_ru  │
│ station_id (FK)     │       │ status (enum)       │       │ is_active           │
│ kind (start/end)    │       │ station_id (FK)     │       │ sort_order          │
│ item_id             │       │ session_id (FK)     │       └─────────────────────┘
│ value_bool          │       │ status_event_id (FK)│
│ value_text          │       │ reported_by_worker_id
└─────────────────────┘       │ station_reason_id   │◄── JSONB key reference
                              │ report_reason_id (FK)
                              │ description         │
                              │ image_url           │
                              │ admin_notes         │
                              │ status_changed_at   │
                              │ status_changed_by   │
                              └─────────────────────┘
```

### Core Tables

#### workers
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `worker_code` | TEXT | Unique worker identifier for login |
| `full_name` | TEXT | Display name |
| `department` | TEXT | Optional department grouping |
| `language` | TEXT | Preferred language (he/ru/auto) |
| `role` | ENUM | worker or admin |
| `is_active` | BOOLEAN | Soft delete flag |

#### stations
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `code` | TEXT | Unique station code |
| `name` | TEXT | Display name |
| `station_type` | TEXT | Machine category |
| `is_active` | BOOLEAN | Soft delete flag |
| `start_checklist` | JSONB | Start-of-shift checklist items |
| `end_checklist` | JSONB | End-of-shift checklist items |
| `station_reasons` | JSONB | Malfunction reasons specific to station |

**station_reasons JSONB structure:**
```json
[
  {
    "id": "general-malfunction",
    "label_he": "תקלת כללית",
    "label_ru": "Общая неисправность",
    "is_active": true
  }
]
```

#### jobs
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `job_number` | TEXT | Unique job/order number |
| `customer_name` | TEXT | Customer reference |
| `description` | TEXT | Job description |
| `planned_quantity` | INTEGER | Target production quantity |

#### sessions
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `worker_id` | UUID FK | Worker reference |
| `station_id` | UUID FK | Station reference |
| `job_id` | UUID FK | Job reference |
| `status` | ENUM | active/completed/aborted |
| `current_status_id` | UUID FK | Mirrored from latest status_event |
| `started_at` | TIMESTAMPTZ | Session start time |
| `ended_at` | TIMESTAMPTZ | Session end time |
| `last_seen_at` | TIMESTAMPTZ | Last heartbeat timestamp |
| `forced_closed_at` | TIMESTAMPTZ | If force-closed by system/admin |
| `last_status_change_at` | TIMESTAMPTZ | Mirrored for efficient queries |
| `active_instance_id` | TEXT | Browser tab identifier for multi-tab prevention |
| `total_good` | INTEGER | Good units produced |
| `total_scrap` | INTEGER | Scrap units |
| `scrap_report_submitted` | BOOLEAN | Whether scrap was reported |
| `*_snapshot` | TEXT | Historical snapshots of worker/station names |

**Snapshot Columns:**
- `worker_full_name_snapshot`, `worker_code_snapshot`
- `station_name_snapshot`, `station_code_snapshot`

Used for historical records where original names matter, even if entity is later renamed.

#### status_definitions
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `scope` | TEXT | 'global' or 'station' |
| `station_id` | UUID FK | Required if scope='station' |
| `label_he` | TEXT | Hebrew label |
| `label_ru` | TEXT | Russian label |
| `color_hex` | TEXT | Status color (15-color palette) |
| `machine_state` | TEXT | production/setup/stoppage |
| `report_type` | TEXT | none/malfunction/general |
| `is_protected` | BOOLEAN | Cannot be edited/deleted |

**Protected Statuses:**
| Key | Hebrew | State | Report Type |
|-----|--------|-------|-------------|
| production | ייצור | production | none |
| malfunction | תקלה | stoppage | malfunction |
| stop | עצירה | stoppage | general |
| other | אחר | stoppage | none |

**Color Palette (15 allowed values):**
```
#ef4444 #f97316 #f59e0b #eab308 #84cc16
#22c55e #10b981 #14b8a6 #06b6d4 #0ea5e9
#3b82f6 #6366f1 #8b5cf6 #a855f7 #94a3b8
```

#### status_events
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `session_id` | UUID FK | Parent session |
| `status_definition_id` | UUID FK | Status reference |
| `station_reason_id` | TEXT | Key into station.station_reasons JSONB |
| `note` | TEXT | Optional note |
| `image_url` | TEXT | Optional image reference |
| `report_id` | UUID FK | Linked report if created |
| `started_at` | TIMESTAMPTZ | Event start time |
| `ended_at` | TIMESTAMPTZ | Event end time (NULL if current) |

#### reports
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `type` | ENUM | malfunction/general/scrap |
| `status` | ENUM | Type-dependent status |
| `station_id` | UUID FK | Station reference |
| `session_id` | UUID FK | Session that created report |
| `status_event_id` | UUID FK | Status event that triggered report |
| `reported_by_worker_id` | UUID FK | Worker who reported |
| `station_reason_id` | TEXT | For malfunctions: key into station_reasons |
| `report_reason_id` | UUID FK | For general reports: references report_reasons |
| `description` | TEXT | Report description |
| `image_url` | TEXT | Uploaded image URL |
| `admin_notes` | TEXT | Admin comments |
| `status_changed_at` | TIMESTAMPTZ | Last status change |
| `status_changed_by` | TEXT | Who changed status |

**Report Status Flows:**

```
Malfunction:  open ──► known ──► solved
                │               ▲
                └───────────────┘ (direct solve)
                     solved ──► open (reopen)

General/Scrap:  new ──► approved (one-way)
```

#### report_reasons
Global reasons for general reports (admin-configurable).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `label_he` | TEXT | Hebrew label |
| `label_ru` | TEXT | Russian label |
| `is_active` | BOOLEAN | Active flag |
| `sort_order` | INTEGER | Display order |

### Database Functions (RPC)

#### create_status_event_atomic
Atomic function that eliminates race conditions in status changes:

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
1. Closes all open status events for session (`ended_at = now()`)
2. Inserts new status event
3. Mirrors `current_status_id` and `last_status_change_at` to sessions table

#### get_jobs_with_stats
Aggregates job data with session totals:

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

### Database Triggers

#### Report Status Validation
Enforces state machine rules for report transitions:

```sql
TRIGGER report_state_transition_check
BEFORE UPDATE OF status ON reports
```

**Rules:**
- Malfunction: `open` → `known` or `solved`; `known` → `solved`; `solved` → `open` (reopen)
- General/Scrap: `new` → `approved` only (no backtrack)

#### Report Default Status
Sets initial status based on report type:

```sql
TRIGGER report_set_default_status
BEFORE INSERT ON reports
```

- Malfunction → `open`
- General/Scrap → `new`

### Indexes

```sql
-- Session queries
sessions_current_status_idx ON sessions(current_status_id)
sessions_job_idx ON sessions(job_id)
sessions_started_at_idx ON sessions(started_at)
sessions_station_occupancy_idx ON sessions(station_id, status, last_seen_at)
  WHERE status = 'active' AND ended_at IS NULL AND forced_closed_at IS NULL
sessions_instance_validation_idx ON sessions(id, active_instance_id)
  WHERE status = 'active'

-- Status events
status_events_session_idx ON status_events(session_id)
status_definitions_machine_state_idx ON status_definitions(machine_state)

-- Reports
reports_type_idx ON reports(type)
reports_status_idx ON reports(status)
reports_station_id_idx ON reports(station_id)
reports_session_id_idx ON reports(session_id)
reports_created_at_idx ON reports(created_at DESC)
reports_type_status_idx ON reports(type, status)
reports_status_event_id_idx ON reports(status_event_id)
```

---

## 4. Data Management Patterns

### Data Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Components                         │
│            (React, hooks, contexts)                          │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  lib/api/ (Client Layer)                     │
│   - Auto-adds auth headers (X-Worker-Code, X-Admin-Password)│
│   - Typed responses                                          │
│   - Error handling                                           │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  app/api/ (API Routes)                       │
│   - Validates auth via lib/auth/permissions.ts              │
│   - Calls lib/data/ functions                               │
│   - Returns JSON responses                                   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  lib/data/ (Service Layer)                   │
│   - All Supabase queries centralized here                   │
│   - Uses createServiceSupabase() (service role)             │
│   - Reusable across multiple API routes                     │
│   - Business logic and validation                            │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Supabase (PostgreSQL + RLS)                    │
│   - Row Level Security enabled on all tables                │
│   - Service role bypasses RLS                               │
│   - Database functions for atomic operations                │
└─────────────────────────────────────────────────────────────┘
```

### Key Data Modules

#### lib/data/sessions.ts
Session lifecycle management:

```typescript
// Session creation with automatic status initialization
createSession(payload: SessionPayload): Promise<Session>

// Atomic status event creation (uses RPC)
startStatusEvent(payload: StatusEventPayload): Promise<StatusEvent>

// Session completion with status event closing
completeSession(sessionId: string): Promise<Session>

// Grace period handling
getGracefulActiveSession(workerId: string): Promise<WorkerGraceSessionDetails | null>

// Session abandonment (worker choice or expiry)
abandonActiveSession(sessionId: string, reason: SessionAbandonReason): Promise<void>

// Heartbeat with instance validation
recordSessionHeartbeatWithInstance(sessionId: string, instanceId: string): Promise<HeartbeatResult>

// Close all active sessions for worker (single-session enforcement)
closeActiveSessionsForWorker(workerId: string): Promise<string[]>
```

#### lib/data/reports.ts
Unified reports system:

```typescript
// Create report (status set by trigger)
createReport(payload: CreateReportPayload): Promise<Report>

// Update report status (validates state machine)
updateReportStatus(payload: UpdateReportStatusPayload): Promise<Report>

// Malfunction reports grouped by station
getMalfunctionReportsGroupedByStation(): Promise<StationWithReports[]>

// Archived (solved) malfunction reports
getArchivedMalfunctionReports(): Promise<StationWithArchivedReports[]>

// General reports (feed view)
getGeneralReports(options?: { status?: string; limit?: number }): Promise<ReportWithDetails[]>

// Scrap reports grouped by station
getScrapReportsGroupedByStation(): Promise<StationWithScrapReports[]>

// Count functions for notification badges
getOpenMalfunctionReportsCount(): Promise<number>
getPendingGeneralReportsCount(): Promise<number>
getPendingScrapReportsCount(): Promise<number>

// View transformation utilities
filterOngoingReports(reports): ReportWithDetails[]
filterFinishedReports(reports): ReportWithDetails[]
groupReportsByDate(reports): { date: string; reports: ReportWithDetails[] }[]
flattenStationReports(stations): ReportWithDetails[]
sortByMalfunctionPriority(reports): ReportWithDetails[]
```

#### lib/data/status-definitions.ts
Status configuration management:

```typescript
// Fetch statuses (global + station-specific)
fetchActiveStatusDefinitions(stationId?: string): Promise<StatusDefinition[]>

// CRUD operations
createStatusDefinition(payload: StatusDefinitionInput): Promise<StatusDefinition>
updateStatusDefinition(id: string, payload: Partial<StatusDefinitionInput>): Promise<StatusDefinition>
deleteStatusDefinition(id: string): Promise<void>  // Reassigns to fallback

// Protected status access
getProtectedStatusDefinition(key: ProtectedStatusKey): Promise<StatusDefinition>

// Validation
isProtectedStatus(labelHe: string): boolean
PROTECTED_LABELS_HE: string[]
```

#### lib/data/jobs.ts
Job management with statistics:

```typescript
// Worker flow: get or create job
getOrCreateJob(jobNumber: string, payload?: JobInput): Promise<Job>

// Admin: fetch all jobs with aggregated stats
fetchAllJobsWithStats(options?: { search?: string; status?: string }): Promise<JobWithStats[]>

// CRUD operations
createJobAdmin(payload): Promise<Job>
updateJob(id: string, payload): Promise<Job>
deleteJob(id: string): Promise<void>  // Checks for active sessions

// Validation
hasActiveSessionsForJob(jobId: string): Promise<boolean>
```

#### lib/data/admin-dashboard.ts
Admin dashboard queries:

```typescript
// Active sessions with enriched data
fetchActiveSessions(): Promise<ActiveSession[]>
fetchActiveSessionById(sessionId: string): Promise<ActiveSession | null>

// Recent sessions (history)
fetchRecentSessions(args: FetchRecentSessionsArgs): Promise<CompletedSession[]>

// Status events for timeline visualization
fetchStatusEventsBySessionIds(sessionIds: string[]): Promise<SessionStatusEvent[]>

// Malfunction counts per session
fetchMalfunctionCountsBySessionIds(sessionIds: string[]): Promise<Map<string, number>>

// Time calculations by machine state
fetchStoppageTimeBySessionIds(sessionIds: string[]): Promise<Map<string, number>>
fetchSetupTimeBySessionIds(sessionIds: string[]): Promise<Map<string, number>>

// Monthly job throughput
fetchMonthlyJobThroughput(args: FetchMonthlyJobThroughputArgs): Promise<JobThroughput[]>
```

### Status Mirroring Pattern

The `current_status_id` in `sessions` is a denormalized mirror of the latest status event. This enables efficient dashboard queries without joins.

**Implementation via `create_status_event_atomic()`:**

```sql
-- 1. Close open events
UPDATE status_events SET ended_at = now()
WHERE session_id = p_session_id AND ended_at IS NULL;

-- 2. Insert new event
INSERT INTO status_events (...) VALUES (...) RETURNING * INTO v_result;

-- 3. Mirror to sessions (same transaction)
UPDATE sessions SET
  current_status_id = p_status_definition_id,
  last_status_change_at = now()
WHERE id = p_session_id;
```

**Usage:**
```typescript
// TypeScript client code
const { data, error } = await supabase.rpc("create_status_event_atomic", {
  p_session_id: sessionId,
  p_status_definition_id: statusId,
  p_note: note,
  // ...
});
```

### Snapshot vs FK Join Strategy

| Scenario | Use Snapshots | Use FK Joins |
|----------|---------------|--------------|
| Historical records display | ✓ | |
| Completed session archives | ✓ | |
| Audit trails | ✓ | |
| Active session monitoring | | ✓ |
| Real-time dashboard updates | | ✓ |
| Current entity information | | ✓ |

**Snapshot columns are populated at session creation:**
```typescript
// When creating session, snapshot current names
worker_full_name_snapshot: worker.full_name,
worker_code_snapshot: worker.worker_code,
station_name_snapshot: station.name,
station_code_snapshot: station.code
```

### Instance Tracking Pattern

Prevents same session running in multiple browser tabs:

```typescript
// On heartbeat
async function recordSessionHeartbeatWithInstance(sessionId: string, instanceId: string) {
  // 1. Fetch session's current instance
  const session = await supabase.from("sessions").select("active_instance_id, status").eq("id", sessionId);

  // 2. Validate instance matches
  if (session.active_instance_id && session.active_instance_id !== instanceId) {
    return { success: false, error: "INSTANCE_MISMATCH" };
  }

  // 3. Update heartbeat and claim instance
  await supabase.from("sessions").update({
    last_seen_at: timestamp,
    active_instance_id: instanceId
  }).eq("id", sessionId);
}
```

**Client handles `INSTANCE_MISMATCH` by redirecting to session-transferred page.**

### Report-Status Event Linking

Reports are linked to the status event that triggered them via `status_event_id`:

```
Session → Status Event (stoppage) → Report (malfunction)
                │                        │
                └── status_event_id ─────┘
```

This enables:
- Tracking report duration (status event `ended_at`)
- Filtering ongoing vs. finished reports
- Timeline visualization with report context

---

## 5. Application Architecture

### Route Groups

```
app/
├── (worker)/              # Worker-facing flow (protected by WorkerSessionContext)
│   ├── login/             # Worker code authentication
│   ├── station/           # Station selection
│   ├── job/               # Job number entry
│   ├── checklist/
│   │   ├── start/         # Pre-work checklist
│   │   └── end/           # Post-work checklist
│   ├── work/              # Active work screen (status, quantities)
│   └── session-transferred/  # Shown when session taken over
│
├── admin/                 # Admin dashboard (protected by cookie session)
│   ├── page.tsx           # Main dashboard (active sessions, KPIs)
│   ├── history/           # Session history with filters
│   ├── reports/
│   │   ├── malfunctions/  # Malfunction reports management
│   │   ├── general/       # General reports + reasons management
│   │   └── scrap/         # Scrap reports management
│   ├── manage/            # Entity management
│   │   ├── workers        # Workers CRUD + permissions
│   │   ├── stations       # Stations CRUD + statuses
│   │   ├── jobs           # Jobs CRUD
│   │   └── statuses       # Global status definitions
│   └── session/[id]/      # Individual session detail view
│
└── api/                   # API routes (Next.js Route Handlers)
```

### Key React Contexts

#### WorkerSessionContext
Manages worker authentication and active session state:

```typescript
interface WorkerSessionContextValue {
  worker: Worker | null;
  session: Session | null;
  station: Station | null;
  job: Job | null;
  setWorker: (worker: Worker | null) => void;
  setSession: (session: Session | null) => void;
  setStation: (station: Station | null) => void;
  setJob: (job: Job | null) => void;
  clearAll: () => void;
}
```

#### LanguageContext
RTL-first internationalization (Hebrew/Russian):

```typescript
interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string) => string;
}
```

### Key Custom Hooks

#### useSessionHeartbeat
Maintains session liveness:

```typescript
function useSessionHeartbeat(sessionId: string | null, instanceId: string) {
  // Sends heartbeat every 15 seconds
  // Validates instance to prevent multi-tab conflicts
  // Triggers session takeover flow on INSTANCE_MISMATCH
}
```

#### useSessionBroadcast
Cross-tab session state synchronization:

```typescript
function useSessionBroadcast() {
  // Uses BroadcastChannel API
  // Notifies other tabs of session changes
  // Handles session takeover scenarios
}
```

---

## 6. API Layer

### Authentication Headers

| Actor | Method | Header | Validation |
|-------|--------|--------|------------|
| Worker | Worker code lookup | `X-Worker-Code` | `lib/auth/permissions.ts` |
| Admin | Password validation | `X-Admin-Password` | Compared with env `ADMIN_PASSWORD` |
| Admin | Session cookie | `admin_session` (15-min TTL) | Cookie validation |

### Worker Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/workers/login` | POST | Authenticate by worker code |
| `/api/workers/active-session` | GET | Get active session for recovery |
| `/api/sessions/heartbeat` | POST | Update `last_seen_at` with instance |
| `/api/sessions/complete` | POST | Mark session completed |
| `/api/sessions/abandon` | POST | Abandon session (worker choice) |
| `/api/sessions/takeover` | POST | Take over session to new instance |
| `/api/sessions/quantities` | PATCH | Update good/scrap counts |
| `/api/status-events` | POST | Create status event (atomic) |
| `/api/status-events/with-report` | POST | Create status event + report |
| `/api/reports` | POST | Create report |
| `/api/checklists` | GET | Get station checklists |
| `/api/checklists/responses` | POST | Submit checklist responses |

### Admin Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/auth/login` | POST | Admin login, set cookie |
| `/api/admin/auth/session` | GET | Validate admin session |
| `/api/admin/auth/change-password` | POST | Change admin password |
| `/api/admin/dashboard/active-sessions` | GET | All active sessions |
| `/api/admin/dashboard/active-sessions/stream` | GET | SSE for real-time updates |
| `/api/admin/dashboard/recent-sessions` | GET | Session history |
| `/api/admin/dashboard/status-events` | GET | Status timeline data |
| `/api/admin/dashboard/monthly-throughput` | GET | Job throughput stats |
| `/api/admin/sessions/close-all` | POST | Force-close all sessions |
| `/api/admin/sessions/delete` | DELETE | Delete session record |
| `/api/admin/workers` | GET/POST | List/create workers |
| `/api/admin/workers/[id]` | GET/PUT/DELETE | Worker CRUD |
| `/api/admin/stations` | GET/POST | List/create stations |
| `/api/admin/stations/[id]` | GET/PUT/DELETE | Station CRUD |
| `/api/admin/jobs` | GET/POST | List/create jobs |
| `/api/admin/jobs/[id]` | GET/PUT/DELETE | Job CRUD |
| `/api/admin/status-definitions` | GET/POST | Global statuses |
| `/api/admin/status-definitions/[id]` | PUT/DELETE | Status CRUD |
| `/api/admin/reports` | GET | Fetch reports by type |
| `/api/admin/reports/[id]` | PATCH | Update report status |
| `/api/admin/reports/reasons` | GET/POST | Report reasons CRUD |
| `/api/admin/reports/stream` | GET | SSE for report updates |

### Cron Routes

| Route | Purpose |
|-------|---------|
| `/api/cron/close-idle-sessions` | Close sessions idle >5 minutes |

---

## 7. Security Model

### Row Level Security (RLS)

All tables have RLS enabled. API routes use service role to bypass RLS.

**Policy examples:**
```sql
-- Anonymous can read active stations
CREATE POLICY "anon_read_stations" ON stations
  FOR SELECT TO anon USING (is_active = true);

-- Service role bypasses all policies
-- (used by API routes via SUPABASE_SERVICE_ROLE_KEY)
```

### Authentication Flow

**Worker Flow:**
```
1. Enter worker code → POST /api/workers/login
2. Server validates code exists, is_active=true
3. Returns worker data, client stores in context
4. Subsequent requests include X-Worker-Code header
5. API routes validate header via lib/auth/permissions.ts
```

**Admin Flow:**
```
1. Enter password → POST /api/admin/auth/login
2. Server validates against ADMIN_PASSWORD env
3. Sets HttpOnly cookie (admin_session, 15-min TTL)
4. Subsequent requests validated by cookie
5. Can also use X-Admin-Password header for API calls
```

### Session Security

| Feature | Implementation |
|---------|----------------|
| Single session per worker | `closeActiveSessionsForWorker()` on new session |
| Multi-tab prevention | `active_instance_id` validation on heartbeat |
| Idle timeout | Cron job closes sessions with `last_seen_at` > 5 min |
| Grace period | 5-minute recovery window after disconnect |
| UTC timestamps | All time comparisons use UTC |

### HTTPS Requirement

All authentication headers are transmitted in plaintext. **Production MUST use HTTPS.**

---

## 8. Testing Strategy

### Integration Tests

Located in `tests/integration/`:

| File | Coverage |
|------|----------|
| `session-lifecycle.test.ts` | Session creation, status mirroring, concurrent updates |
| `status-definitions.test.ts` | Protected status rules, deletion reassignment, scoping |
| `malfunctions.test.ts` | State machine transitions (now via reports table) |

### Test Utilities

```typescript
// tests/helpers.ts
TestFactory.createWorker(suffix)      // Create test worker
TestFactory.createStation(suffix)     // Create test station
TestFactory.getProductionStatus()     // Get production status ID
TestCleanup.cleanupSessions(ids)      // Clean up after tests
```

### Running Tests

```bash
npm run test           # Watch mode
npm run test:run       # Single run
npm run test -- path   # Specific file
```

Tests run against live Supabase database (uses `.env.local`).

---

## 9. Conventions

### Hebrew Text
- UTF-8 encoded, no BOM
- Output Hebrew literally (א–ת)
- No nikud (vowels)
- No HTML entities or Unicode escapes

### Styling (RTL-First)
- Root layout: `dir="rtl"`
- Labels on right, inputs on left
- shadcn/ui + Tailwind CSS only
- No custom CSS frameworks
- Modern, clean design (no gradients, glowing effects)
- Neutral backgrounds, 1–2 accent colors

### Code Style
- Early returns for readability
- `handle` prefix for event handlers
- Const arrow functions
- Tailwind classes only (no inline styles)

### File Naming
- Components: PascalCase (`StatusCard.tsx`)
- Utilities: camelCase (`formatTime.ts`)
- API routes: lowercase (`route.ts` in directories)

---

## 10. Environment Variables

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ADMIN_PASSWORD=<admin-password>

# Optional
NODE_ENV=development|production
```

---

## 11. Migrations Reference

### Recent Migrations

| Migration | Purpose |
|-----------|---------|
| `20251228192515_generalized_reports_schema.sql` | Unified reports table, report_reasons, state machine |
| `20251228192624_migrate_malfunctions_to_reports.sql` | Data migration from legacy malfunctions |
| `20251229120000_cleanup_legacy_malfunctions.sql` | Remove legacy malfunction table |
| `20251229193926_make_stop_status_protected.sql` | Add "stop" as protected status |
| `20251230100000_add_status_event_id_to_reports.sql` | Link reports to status events |
| `20251230151610_add_instance_tracking.sql` | Multi-tab prevention (active_instance_id) |
| `20251230170326_close_orphaned_status_events.sql` | Cleanup orphaned events |

### Core Schema Migrations

| Migration | Purpose |
|-----------|---------|
| `20250101000000_base_schema.sql` | Initial schema (workers, stations, jobs, sessions) |
| `20251212100000_status_definitions.sql` | Status definitions table |
| `20251215112227_enable_rls_policies.sql` | Enable RLS on all tables |
| `20251227233225_atomic_status_event_function.sql` | Atomic status function |
| `20251227233746_malfunction_state_machine.sql` | State machine trigger |
| `20251227233819_jsonb_validation.sql` | Checklist JSONB validation |

---

## 12. Troubleshooting

### Status Event Creation Fails
1. Verify `status_definition_id` exists
2. Check status is allowed for station (global or matching station_id)
3. Ensure `create_status_event_atomic` function exists
4. Verify session is active

### Protected Status Cannot Be Modified
- Check `is_protected = true` in `status_definitions`
- Protected labels: ייצור, תקלה, עצירה, אחר

### Report Transition Rejected
- Malfunction: `open` → `known`/`solved`, `known` → `solved`, `solved` → `open`
- General/Scrap: `new` → `approved` only

### Session Not Closing
1. Check `last_seen_at` timestamp
2. Verify cron job is running (`/api/cron/close-idle-sessions`)
3. Grace period is 5 minutes from last heartbeat

### Instance Mismatch Error
- Session running in another tab/device
- Client should redirect to `/session-transferred`
- Can use "takeover" to reclaim session

### RLS Policy Blocking Queries
- Ensure API routes use `createServiceSupabase()` (service role)
- Check that RLS policies allow intended operations
- Anon key has limited access (read-only for public data)
