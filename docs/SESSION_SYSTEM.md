# Session System Documentation

This document provides a comprehensive overview of the worker session system, including session lifecycle, active session management, idle session purging, and session recovery.

## Table of Contents

1. [Session Lifecycle](#session-lifecycle)
2. [Session States](#session-states)
3. [Single Session Per Worker](#single-session-per-worker)
4. [Heartbeat System](#heartbeat-system)
5. [Idle Session Purging](#idle-session-purging)
6. [Session Recovery & Grace Period](#session-recovery--grace-period)
7. [Key Files Reference](#key-files-reference)
8. [Database Schema](#database-schema)
9. [Configuration Constants](#configuration-constants)

---

## Session Lifecycle

Sessions follow a well-defined lifecycle from creation to completion:

```
┌─────────────┐    ┌─────────────┐    ┌───────────────┐    ┌─────────────┐    ┌─────────────┐
│   Login     │───►│   Station   │───►│     Job       │───►│   Start     │───►│    Work     │
│   (worker)  │    │  Selection  │    │    Entry      │    │  Checklist  │    │   (active)  │
└─────────────┘    └─────────────┘    └───────────────┘    └─────────────┘    └──────┬──────┘
                                              │                                       │
                                              │ Session Created                       │ Heartbeat
                                              ▼                                       │ every 15s
                                       status='active'                                │
                                       started_at=now                                 │
                                                                                      ▼
                                      ┌─────────────────────────────────────────────────────┐
                                      │                    Active Work                      │
                                      │  - Status changes logged as status_events          │
                                      │  - Production totals updated (good/scrap)          │
                                      │  - last_seen_at updated every 15 seconds           │
                                      └─────────────────────────────────────────────────────┘
                                                              │
                                      ┌───────────────────────┴───────────────────────┐
                                      │                                               │
                                      ▼                                               ▼
                               ┌─────────────┐                                ┌───────────────┐
                               │     End     │                                │ Idle Timeout  │
                               │  Checklist  │                                │  (5 minutes)  │
                               └──────┬──────┘                                └───────┬───────┘
                                      │                                               │
                                      ▼                                               ▼
                               ┌─────────────┐                                ┌───────────────┐
                               │  Complete   │                                │  Auto-Close   │
                               │   Session   │                                │ forced_closed │
                               └─────────────┘                                └───────────────┘
                                      │                                               │
                                      └───────────────────┬───────────────────────────┘
                                                          ▼
                                                   status='completed'
                                                   ended_at=now
```

### Step-by-Step Flow

1. **Login** (`/login`)
   - Worker enters their code
   - System checks for existing active sessions (for potential recovery)

2. **Station Selection** (`/station`)
   - Worker selects their workstation
   - Recovery dialog appears if resumable session exists

3. **Job Entry** (`/job`)
   - Worker enters job number
   - **Any existing active sessions for this worker are automatically closed**
   - **Session is created** with `status='active'`
   - Initial status set to earliest configured status definition
   - Snapshot fields populated (worker name, station name)

4. **Start Checklist** (`/checklist/start`)
   - Worker completes pre-work checklist
   - Sets `start_checklist_completed = true`

5. **Active Work** (`/work`)
   - Main production interface
   - Heartbeat pings every 15 seconds
   - Status changes create `status_events` records
   - Production totals updated in real-time

6. **End Checklist** (`/checklist/end`)
   - Worker completes post-work checklist
   - Sets `end_checklist_completed = true`

7. **Session Completion**
   - Sets `status = 'completed'`, `ended_at = now`
   - All open status events are closed

---

## Session States

Sessions use a simple state model:

| Status | Description |
|--------|-------------|
| `active` | Session is in progress, worker actively working |
| `completed` | Session ended normally or was auto-closed |
| `aborted` | Session was explicitly aborted (rarely used) |

### Key Timestamp Fields

| Field | Purpose |
|-------|---------|
| `started_at` | When session was created |
| `ended_at` | When session completed (normal or forced) |
| `last_seen_at` | Last heartbeat timestamp (for idle detection) |
| `forced_closed_at` | Set if session was auto-closed due to idle timeout |
| `last_status_change_at` | When current status was set |

---

## Single Session Per Worker

The system enforces a **single active session per worker** constraint. A worker cannot have multiple active sessions simultaneously.

### Enforcement Mechanism

When a worker creates a new session (via the job entry page), the system:

1. **Checks for existing active sessions** for that worker
2. **Automatically closes any active sessions** found:
   - Closes all open status events
   - Creates a final "stopped" status event with note `"replaced-by-new-session"`
   - Sets `status = 'completed'`, `ended_at = now`, `forced_closed_at = now`
3. **Creates the new session**

### Implementation

**File:** `lib/data/sessions.ts`

```typescript
export async function closeActiveSessionsForWorker(workerId: string): Promise<string[]>
```

This function is called by `/api/jobs` before creating a new session:

```typescript
// Close any existing active sessions for this worker
await closeActiveSessionsForWorker(workerId);

// Create new session
const session = await createSession({ ... });
```

### Why This Matters

- **Prevents orphaned sessions**: Workers who forget to end their session can start fresh
- **Ensures data integrity**: Only one session is actively tracking work at a time
- **Simplifies admin dashboard**: Each worker appears only once in active sessions
- **Automatic cleanup**: No manual intervention needed to close stale sessions

### Session Replacement Flow

```
Worker has active session on Station A
       │
       ▼
Worker logs in and selects Station B
       │
       ▼
Worker enters new job number
       │
       ▼
┌─────────────────────────────────────────┐
│  closeActiveSessionsForWorker()         │
│                                         │
│  1. Find active sessions for worker     │
│  2. Close status events                 │
│  3. Create "stopped" event              │
│  4. Mark session completed              │
│     (forced_closed_at = now)            │
└─────────────────────────────────────────┘
       │
       ▼
New session created on Station B
```

---

## Heartbeat System

The heartbeat system keeps sessions alive and enables idle detection.

### Client-Side Implementation

**File:** `hooks/useSessionHeartbeat.ts`

```typescript
const HEARTBEAT_INTERVAL_MS = 15_000; // 15 seconds
```

**Behavior:**
- Sends POST to `/api/sessions/heartbeat` every 15 seconds
- Updates `sessions.last_seen_at` to current timestamp
- On page unload (beforeunload/pagehide):
  - Uses `navigator.sendBeacon()` for reliable delivery
  - Ensures final heartbeat is sent even on abrupt close

**Flow:**
```
Work page mounts
       │
       ▼
useSessionHeartbeat(sessionId) activated
       │
       ├──► Immediate heartbeat sent
       │
       ▼
   ┌─────────────────────────────────┐
   │   Every 15 seconds:             │
   │   POST /api/sessions/heartbeat  │
   │   → updates last_seen_at        │
   └─────────────────────────────────┘
       │
       ▼
Page unload event
       │
       ▼
Final beacon heartbeat sent
```

### Server-Side Implementation

**File:** `app/api/sessions/heartbeat/route.ts`

- Accepts `{ sessionId }` in request body
- Calls `recordSessionHeartbeat(sessionId)` from `lib/data/sessions.ts`
- Updates `last_seen_at = now()` in database
- Lightweight operation, no validation overhead

---

## Idle Session Purging

Sessions without heartbeats for 5 minutes are automatically closed.

### Configuration

```typescript
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
```

### Detection Mechanism

**File:** `app/api/cron/close-idle-sessions/route.ts`

**Triggers:**
1. **Admin Dashboard Hook:** `useIdleSessionCleanup()` calls endpoint every 10 seconds
2. **External Cron:** Can be triggered via scheduled job (Vercel cron, external scheduler)

### Purge Logic

```
1. Fetch all sessions where:
   - status = 'active'
   - ended_at IS NULL
   - forced_closed_at IS NULL

2. For each session:
   - Calculate idle time: now - (last_seen_at ?? started_at)
   - If idle time > 5 minutes → mark as idle

3. For each idle session:
   a. Close all open status_events (set ended_at = now)
   b. Create final "stopped" status event with note: "grace-window-expired"
   c. Update session:
      - status = 'completed'
      - ended_at = now
      - forced_closed_at = now
      - current_status_id = stopped_status_id
      - last_status_change_at = now
```

### Important: Fallback for Missing Heartbeats

Sessions may not have a `last_seen_at` value if:
- The worker never reached the work page (stopped at checklist)
- The heartbeat failed to record

In these cases, the system uses `started_at` as the fallback for idle calculation.

### Visual Flow

```
   ┌───────────────────────────────────────────────────────────────┐
   │                   Active Session                              │
   │   last_seen_at: 10:00:00                                      │
   └───────────────────────────────────────────────────────────────┘
                              │
                              │ No heartbeat for 5+ minutes
                              ▼
   ┌───────────────────────────────────────────────────────────────┐
   │               Idle Detection (cron/hook)                      │
   │   Current time: 10:05:30                                      │
   │   Idle duration: 5m 30s > 5m threshold                        │
   └───────────────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌───────────────────────────────────────────────────────────────┐
   │                    Auto-Close                                 │
   │   - Close open status_events                                  │
   │   - Create "stopped" event (note: "grace-window-expired")     │
   │   - Set forced_closed_at = now                                │
   │   - Set status = 'completed'                                  │
   └───────────────────────────────────────────────────────────────┘
```

---

## Session Recovery & Grace Period

Workers can resume sessions within a 5-minute grace window from their last activity.

### Grace Window

```typescript
const SESSION_GRACE_MS = 5 * 60 * 1000; // 5 minutes
```

### Recovery Detection

**When worker logs in:**

1. Call `fetchWorkerActiveSessionApi(workerId)`
2. Server checks `getGracefulActiveSession(workerId)` in `lib/data/sessions.ts`

**Grace Validation Logic:**
```typescript
lastSeenSource = session.last_seen_at ?? session.started_at
graceExpiresAt = lastSeenSource + 5 minutes

if (now >= graceExpiresAt) {
    // Grace expired - auto-close session
    abandonActiveSession(sessionId, "expired")
    return null
} else {
    // Within grace - allow resume
    return { session, station, job, graceExpiresAt }
}
```

### Recovery Flow

```
Worker logs in
       │
       ▼
Check for active session
       │
       ├── No active session ─────────────► Normal flow (station → job → ...)
       │
       └── Active session found
                  │
                  ▼
           ┌──────────────────┐
           │ Validate Grace   │
           │ Window           │
           └────────┬─────────┘
                    │
       ┌────────────┴────────────┐
       │                         │
       ▼                         ▼
   Within Grace              Grace Expired
       │                         │
       ▼                         ▼
┌─────────────────┐      ┌─────────────────┐
│ Show Recovery   │      │ Auto-close      │
│ Dialog          │      │ session         │
│                 │      │                 │
│ - Session info  │      │ Continue to     │
│ - Countdown     │      │ normal flow     │
│ - Resume button │      └─────────────────┘
│ - Discard button│
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
 Resume    Discard
    │         │
    ▼         ▼
Navigate   Abandon session
to /work   Start fresh
```

### Recovery Dialog

**Location:** Station selection page (`/station`)

**Displays:**
- Job information from session snapshot
- Countdown timer until grace expires
- "Resume Session" button
- "Discard & Start New" button

### Resume Action

When worker clicks "Resume":
1. `hydrateFromSnapshot(recovery)` restores context state
2. Session state restored: `sessionId`, `started_at`, `station`, `job`, `totals`
3. `startCompleted = true` (skips start checklist)
4. Navigate directly to `/work` page

### Discard Action

When worker clicks "Discard":
1. `abandonSessionApi(sessionId, "worker_choice")`
2. Session closed with `note: "worker-abandon"`
3. Worker continues to fresh session flow

---

## Key Files Reference

### Context & State Management

| File | Purpose |
|------|---------|
| `contexts/WorkerSessionContext.tsx` | Session state via reducer (worker, station, job, session, status, totals, recovery) |

### Data Layer

| File | Purpose |
|------|---------|
| `lib/data/sessions.ts` | All session CRUD operations |
| `lib/data/admin-dashboard.ts` | Admin session queries |

**Key Functions in `lib/data/sessions.ts`:**
- `createSession(payload)` - Create new session with initial status
- `completeSession(sessionId)` - Mark session completed
- `recordSessionHeartbeat(sessionId)` - Update `last_seen_at`
- `closeActiveSessionsForWorker(workerId)` - Close all active sessions for a worker (enforces single-session constraint)
- `getGracefulActiveSession(workerId)` - Fetch resumable session with grace validation
- `abandonActiveSession(sessionId, reason)` - Force-close session
- `startStatusEvent(payload)` - Create status change, mirror to session

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/jobs` | POST | Create job + session (closes existing sessions first) |
| `/api/sessions/heartbeat` | POST | Record heartbeat |
| `/api/sessions/complete` | POST | Complete session |
| `/api/sessions/abandon` | POST | Abandon session |
| `/api/sessions/quantities` | POST | Update totals |
| `/api/workers/active-session` | GET | Fetch resumable session |
| `/api/cron/close-idle-sessions` | GET/POST | Purge idle sessions |
| `/api/status-events` | POST | Record status changes |

### Hooks

| File | Purpose |
|------|---------|
| `hooks/useSessionHeartbeat.ts` | 15s heartbeat + beacon on unload |
| `hooks/useIdleSessionCleanup.ts` | 10s idle session check (admin) |

### Worker Pages

| Route | Purpose |
|-------|---------|
| `/login` | Worker authentication |
| `/station` | Station selection, recovery dialog |
| `/job` | Job entry, session creation |
| `/checklist/start` | Pre-work checklist |
| `/work` | Main work interface |
| `/checklist/end` | Post-work checklist |

---

## Database Schema

### `sessions` Table

```sql
CREATE TABLE sessions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id                   UUID REFERENCES workers(id) ON DELETE SET NULL,
  station_id                  UUID REFERENCES stations(id) ON DELETE SET NULL,
  job_id                      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- State
  status                      session_status NOT NULL DEFAULT 'active',
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at                    TIMESTAMPTZ,
  forced_closed_at            TIMESTAMPTZ,  -- Set if auto-closed

  -- Heartbeat
  last_seen_at                TIMESTAMPTZ,  -- Updated every 15s

  -- Status mirroring (for efficient dashboard queries)
  current_status_id           UUID REFERENCES status_definitions(id),
  last_status_change_at       TIMESTAMPTZ,

  -- Production totals
  total_good                  INTEGER NOT NULL DEFAULT 0,
  total_scrap                 INTEGER NOT NULL DEFAULT 0,

  -- Checklist flags
  start_checklist_completed   BOOLEAN NOT NULL DEFAULT false,
  end_checklist_completed     BOOLEAN NOT NULL DEFAULT false,

  -- Historical snapshots (preserved if worker/station deleted)
  worker_full_name_snapshot   TEXT,
  worker_code_snapshot        TEXT,
  station_name_snapshot       TEXT,
  station_code_snapshot       TEXT
);
```

### `status_events` Table

```sql
CREATE TABLE status_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status_definition_id  UUID NOT NULL REFERENCES status_definitions(id),
  station_reason_id     TEXT,           -- Optional reason code
  note                  TEXT,           -- "grace-window-expired", "worker-abandon"
  image_url             TEXT,           -- Optional image attachment
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at              TIMESTAMPTZ     -- Set when status changes
);
```

### Session Status Enum

```sql
CREATE TYPE session_status AS ENUM ('active', 'completed', 'aborted');
```

---

## Configuration Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `HEARTBEAT_INTERVAL_MS` | 15,000 (15s) | `hooks/useSessionHeartbeat.ts` | Client heartbeat frequency |
| `IDLE_THRESHOLD_MS` | 300,000 (5m) | `app/api/cron/close-idle-sessions/route.ts` | Idle session timeout |
| `SESSION_GRACE_MS` | 300,000 (5m) | `lib/data/sessions.ts` | Recovery grace window |
| Cleanup check interval | 10,000 (10s) | `hooks/useIdleSessionCleanup.ts` | Admin dashboard cleanup frequency |

---

## State Transition Summary

```
                                    ┌────────────────────────────────┐
                                    │          ACTIVE                │
                                    │                                │
                                    │  - Heartbeats every 15s        │
                                    │  - Status events logged        │
                                    │  - Totals updated              │
                                    └────────────┬───────────────────┘
                                                 │
                      ┌──────────────────────────┼──────────────────────────┐
                      │                          │                          │
                      ▼                          ▼                          ▼
              ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
              │    Normal     │         │ Idle Timeout  │         │    Worker     │
              │  Completion   │         │  (5 minutes)  │         │   Abandon     │
              │               │         │               │         │               │
              │ End checklist │         │ No heartbeat  │         │ Discard in    │
              │ completeSession()│      │ cron closes   │         │ recovery dialog│
              └───────┬───────┘         └───────┬───────┘         └───────┬───────┘
                      │                         │                         │
                      └────────────────────────┬┴─────────────────────────┘
                                               │
                                               ▼
                                    ┌────────────────────────────────┐
                                    │         COMPLETED              │
                                    │                                │
                                    │  status = 'completed'          │
                                    │  ended_at = now                │
                                    │  forced_closed_at = now (if idle)│
                                    └────────────────────────────────┘


                       RECOVERY WINDOW (within 5 minutes of last_seen_at)
              ┌─────────────────────────────────────────────────────────────────┐
              │                                                                 │
              │   Worker can resume session if:                                 │
              │   - Session still active                                        │
              │   - now < last_seen_at + 5 minutes                              │
              │                                                                 │
              │   Actions:                                                      │
              │   - Resume: hydrateFromSnapshot() → continue at /work           │
              │   - Discard: abandonActiveSession() → start fresh               │
              │                                                                 │
              └─────────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall system architecture
- [SESSION_ARCHITECTURE.md](./SESSION_ARCHITECTURE.md) - Detailed session architecture
