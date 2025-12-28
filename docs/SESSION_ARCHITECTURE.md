# Session & Status Architecture

> Comprehensive guide to sessions, status events, real-time updates, and malfunctions
> Updated: December 2025

---

## Quick Reference

### Session States
```typescript
SessionStatus: "active" | "completed" | "aborted"
```

### Status System
```typescript
MachineState: "production" | "setup" | "stoppage"
StatusScope: "global" | "station"
```

### Malfunction States
```typescript
MalfunctionStatus: "open" | "known" | "solved"
// State machine: open → known → solved (enforced by database trigger)
```

### Key Constants
| Constant | Value | Purpose |
|----------|-------|---------|
| Heartbeat interval | 15 seconds | Client ping frequency |
| Idle threshold | 5 minutes | Auto-close timeout |
| Grace period | 5 minutes | Session recovery window |

---

## 1. Session Lifecycle

### Flow Diagram
```
Login → Station → Job Entry → Start Checklist → Active Work → End Checklist → Complete
                      ↓              ↓                ↓
              Session Created   Heartbeat (15s)   Status Events
                      ↓              ↓                ↓
              status='active'  last_seen_at     current_status_id
```

### Lifecycle Steps

| Step | Route | Action | Database Effect |
|------|-------|--------|-----------------|
| 1. Login | `/login` | Worker enters code | Check for active session |
| 2. Station | `/station` | Select workstation | Recovery dialog if resumable |
| 3. Job | `/job` | Enter job number | **Session created**, closes existing |
| 4. Start Checklist | `/checklist/start` | Complete pre-work | `start_checklist_completed = true` |
| 5. Work | `/work` | Active production | Heartbeats, status events, totals |
| 6. End Checklist | `/checklist/end` | Complete post-work | `end_checklist_completed = true` |
| 7. Complete | - | Session ends | `status = 'completed'`, `ended_at` set |

### Single Session Per Worker

When a worker creates a new session:
1. **Close existing sessions** for that worker
2. Create final "stopped" status event with note `"replaced-by-new-session"`
3. Set `forced_closed_at = now` on old session
4. **Create new session** with initial status

```typescript
// lib/data/sessions.ts
await closeActiveSessionsForWorker(workerId);
const session = await createSession({ worker_id, station_id, job_id });
```

---

## 2. Status Event System

### Status Definitions Table
```sql
status_definitions (
  id UUID PRIMARY KEY,
  scope TEXT CHECK (scope IN ('global', 'station')),
  station_id UUID,  -- Required if scope='station'
  label_he TEXT NOT NULL,
  label_ru TEXT,
  color_hex TEXT,  -- Constrained to 15 palette colors
  machine_state TEXT CHECK (machine_state IN ('production', 'setup', 'stoppage')),
  is_protected BOOLEAN DEFAULT FALSE,  -- Cannot edit/delete
  requires_malfunction_report BOOLEAN DEFAULT FALSE
)
```

### Protected Statuses
These statuses cannot be edited or deleted:
- **ייצור** (Production) - `machine_state: 'production'`
- **תקלה** (Malfunction) - `machine_state: 'stoppage'`, requires malfunction report
- **אחר** (Other) - `machine_state: 'stoppage'`, fallback status

### Atomic Status Updates

Status changes use the `create_status_event_atomic()` PostgreSQL function:

```sql
-- Single transaction:
1. UPDATE status_events SET ended_at = now() WHERE session_id = ? AND ended_at IS NULL
2. INSERT INTO status_events (session_id, status_definition_id, ...)
3. UPDATE sessions SET current_status_id = ?, last_status_change_at = now()
```

**Why atomic?** Prevents race conditions when concurrent status updates occur.

### TypeScript Usage
```typescript
// lib/data/sessions.ts
const event = await supabase.rpc("create_status_event_atomic", {
  p_session_id: sessionId,
  p_status_definition_id: statusId,
  p_station_reason_id: reasonId,  // Optional
  p_note: note,                    // Optional
  p_malfunction_id: malfunctionId, // Required if status requires malfunction
});
```

### Status Mirroring

`sessions.current_status_id` mirrors the latest status for efficient queries:

| Query Type | Table | Benefit |
|------------|-------|---------|
| Dashboard (all sessions) | `sessions` | Single table, no joins |
| Timeline (one session) | `status_events` | Full history |

---

## 3. Malfunction System

### State Machine
```
open ──→ known ──→ solved
  │                  ↑
  └──────────────────┘
  (direct resolution)
```

**Invalid transitions blocked by database trigger:**
- `solved` → `open` ❌
- `solved` → `known` ❌
- `known` → `open` ❌

### Malfunction Table
```sql
malfunctions (
  id UUID PRIMARY KEY,
  station_id UUID REFERENCES stations(id),
  session_id UUID REFERENCES sessions(id),  -- Optional link
  status TEXT CHECK (status IN ('open', 'known', 'solved')),
  station_reason_id TEXT,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ  -- Set when status = 'solved'
)
```

### Creating Malfunctions

When worker selects "תקלה" (Malfunction) status:
1. UI prompts for malfunction details
2. Create malfunction record
3. Create status event with `malfunction_id` reference

```typescript
// Create malfunction
const malfunction = await createMalfunction({
  station_id,
  status: "open",
  description,
  image_url,  // Optional, uploaded to Supabase Storage
});

// Link to status event
await startStatusEvent({
  session_id,
  status_definition_id: malfunctionStatusId,
  malfunction_id: malfunction.id,
});
```

### Station Reasons

Each station has configurable malfunction reasons:

```typescript
// stations.station_reasons (JSONB)
[
  { id: "general-malfunction", label_he: "תקלת כללית", label_ru: "Общая неисправность" },
  { id: "paper-jam", label_he: "תקיעת נייר", label_ru: "Застревание бумаги" },
  // Custom reasons per station...
]
```

Default "תקלת כללית" is always included server-side.

---

## 4. Real-Time Updates

### Architecture Overview
```
Worker Client                    Server                      Admin Dashboard
     │                             │                              │
     │ startStatusEvent()          │                              │
     ├────────────────────────────►│                              │
     │                             │ create_status_event_atomic() │
     │                             │ (updates sessions table)     │
     │                             │                              │
     │                             │ SSE Stream / Poll            │
     │                             │◄─────────────────────────────┤
     │                             │                              │
     │                             │ Push update                  │
     │                             ├─────────────────────────────►│
     │                             │                              │ UI refresh
```

### Admin Dashboard Options

| Mode | Endpoint | Mechanism |
|------|----------|-----------|
| Polling | `GET /api/admin/dashboard/active-sessions` | Every 5 seconds |
| Streaming | `GET /api/admin/dashboard/active-sessions/stream` | Server-Sent Events (SSE) |

### SSE Stream Implementation
```typescript
// Server sends events on sessions table changes
{
  type: "initial",      // First load
  type: "update",       // Session modified
  type: "insert",       // New session
  type: "delete",       // Session ended
  type: "heartbeat",    // Keep-alive (every 25s)
}
```

### Session Timeline (Status History)
```typescript
// hooks/useSessionTimeline.ts
// Subscribes to status_events for a specific session
const { segments, loading } = useSessionTimeline(sessionId);
```

---

## 5. Heartbeat System

### Client Implementation
```typescript
// hooks/useSessionHeartbeat.ts
const HEARTBEAT_INTERVAL_MS = 15_000;

// Every 15 seconds while /work is active
POST /api/sessions/heartbeat
Body: { sessionId }

// On page unload (beforeunload/pagehide)
navigator.sendBeacon('/api/sessions/heartbeat', data)
```

### Server Implementation
```typescript
// lib/data/sessions.ts
export async function recordSessionHeartbeat(sessionId: string) {
  await supabase
    .from("sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", sessionId);
}
```

---

## 6. Idle Session Cleanup

### Detection Logic
```typescript
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// For each active session:
const lastActivity = session.last_seen_at ?? session.started_at;
const idleTime = Date.now() - new Date(lastActivity).getTime();
if (idleTime > IDLE_THRESHOLD_MS) {
  // Mark as idle, close session
}
```

### Cleanup Process
1. Find sessions where `status = 'active'` and idle > 5 minutes
2. Close all open status events (`ended_at = now`)
3. Create final "stopped" event with note `"grace-window-expired"`
4. Update session:
   - `status = 'completed'`
   - `ended_at = now`
   - `forced_closed_at = now`

### Triggers
| Trigger | Frequency | Location |
|---------|-----------|----------|
| Admin hook | Every 10 seconds | `useIdleSessionCleanup.ts` |
| Cron endpoint | External scheduler | `/api/cron/close-idle-sessions` |
| Edge function | Supabase schedule | `supabase/functions/close-idle-sessions` |

---

## 7. Session Recovery

### Grace Period Logic
```typescript
const SESSION_GRACE_MS = 5 * 60 * 1000; // 5 minutes

// UTC-safe comparison
const lastSeenUtcMs = parseUtcMs(session.last_seen_at ?? session.started_at);
const graceExpiresAtMs = lastSeenUtcMs + SESSION_GRACE_MS;

if (utcNow() >= graceExpiresAtMs) {
  // Grace expired - auto-close
  await abandonActiveSession(sessionId, "expired");
  return null;
} else {
  // Within grace - allow resume
  return { session, station, job, graceExpiresAt };
}
```

### Recovery Flow
```
Worker logs in
       │
       ▼
Check for active session (getGracefulActiveSession)
       │
       ├── No session ─────► Normal flow
       │
       └── Session found
                │
       ┌────────┴────────┐
       │                 │
   Within Grace     Grace Expired
       │                 │
       ▼                 ▼
Recovery Dialog     Auto-close
       │
   ┌───┴───┐
   │       │
Resume  Discard
   │       │
   ▼       ▼
/work   Abandon + Fresh start
```

### Recovery Dialog Shows
- Job information from session
- Station information
- Countdown timer to grace expiry
- "Resume" and "Discard" buttons

---

## 8. Database Schema

### Sessions Table
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  worker_id UUID REFERENCES workers(id),
  station_id UUID REFERENCES stations(id),
  job_id UUID REFERENCES jobs(id),

  -- Lifecycle
  status session_status DEFAULT 'active',  -- active | completed | aborted
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  forced_closed_at TIMESTAMPTZ,  -- Set if auto-closed

  -- Heartbeat
  last_seen_at TIMESTAMPTZ,

  -- Status mirroring
  current_status_id UUID REFERENCES status_definitions(id),
  last_status_change_at TIMESTAMPTZ,

  -- Production
  total_good INTEGER DEFAULT 0,
  total_scrap INTEGER DEFAULT 0,

  -- Checklists
  start_checklist_completed BOOLEAN DEFAULT FALSE,
  end_checklist_completed BOOLEAN DEFAULT FALSE,

  -- Snapshots (historical names)
  worker_full_name_snapshot TEXT,
  worker_code_snapshot TEXT,
  station_name_snapshot TEXT,
  station_code_snapshot TEXT
);

-- Indexes
CREATE INDEX sessions_current_status_idx ON sessions(current_status_id);
CREATE INDEX sessions_job_idx ON sessions(job_id);
CREATE INDEX sessions_started_at_idx ON sessions(started_at);
```

### Status Events Table
```sql
CREATE TABLE status_events (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  status_definition_id UUID REFERENCES status_definitions(id),
  station_reason_id TEXT,
  note TEXT,  -- "grace-window-expired", "worker-abandon", "replaced-by-new-session"
  image_url TEXT,
  malfunction_id UUID REFERENCES malfunctions(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ  -- Set when next event starts
);
```

---

## 9. API Reference

### Session APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/jobs` | POST | Create job + session (closes existing) |
| `/api/sessions/heartbeat` | POST | Update `last_seen_at` |
| `/api/sessions/complete` | POST | Mark session completed |
| `/api/sessions/abandon` | POST | Force-close session |
| `/api/sessions/quantities` | POST | Update `total_good`/`total_scrap` |
| `/api/workers/active-session` | GET | Get resumable session |

### Status APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/status-events` | POST | Create status event (atomic) |
| `/api/statuses` | GET | Get status definitions for station |
| `/api/admin/status-definitions` | GET/POST | Admin CRUD |
| `/api/admin/status-definitions/[id]` | PUT/DELETE | Admin update/delete |

### Malfunction APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/malfunctions` | POST | Create malfunction |
| `/api/admin/malfunctions` | GET | List all malfunctions |
| `/api/admin/malfunctions/[id]` | PUT | Update status (state machine enforced) |
| `/api/reasons` | GET | Get station reasons |

### Admin Session APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/dashboard/active-sessions` | GET | All active sessions |
| `/api/admin/dashboard/active-sessions/stream` | GET | SSE real-time stream |
| `/api/admin/sessions/close-all` | POST | Force-close all sessions |
| `/api/cron/close-idle-sessions` | GET | Trigger idle cleanup |

---

## 10. Key Files

### Data Layer
| File | Purpose |
|------|---------|
| `lib/data/sessions.ts` | Session CRUD, status events, heartbeat |
| `lib/data/status-definitions.ts` | Status definition queries |
| `lib/data/malfunctions.ts` | Malfunction CRUD |
| `lib/data/admin-dashboard.ts` | Admin session queries |

### Hooks
| File | Purpose |
|------|---------|
| `hooks/useSessionHeartbeat.ts` | 15s heartbeat + beacon |
| `hooks/useSessionTimeline.ts` | Status event history |
| `hooks/useIdleSessionCleanup.ts` | Admin idle cleanup |

### Context
| File | Purpose |
|------|---------|
| `contexts/WorkerSessionContext.tsx` | Session state management |

### Migrations
| File | Purpose |
|------|---------|
| `20251227233225_atomic_status_event_function.sql` | Atomic status updates |
| `20251227233746_malfunction_state_machine.sql` | Malfunction trigger |
| `20251227233201_add_protected_column.sql` | Protected statuses |

---

## 11. Troubleshooting

### Session Won't Close
- Check `last_seen_at` timestamp
- Verify cron job is running
- Grace period is 5 minutes from last activity

### Status Event Fails
- Verify `status_definition_id` exists
- Check if status is allowed for station (scope)
- Ensure `create_status_event_atomic` function exists

### Malfunction Transition Blocked
- State machine enforces: `open` → `known` → `solved`
- Cannot transition from `solved` to any other state
- Cannot transition from `known` back to `open`

### Recovery Not Showing
- Session may have expired (>5 min since last activity)
- Check if `forced_closed_at` is set (already closed)
- Verify worker ID matches session's `worker_id`

### Real-Time Not Updating
- Admin dashboard polls every 5s (not instant)
- Check SSE stream connection
- Verify `current_status_id` is being mirrored

---

## 12. Testing

Integration tests cover critical paths:

```bash
npm run test:run
```

| Test File | Coverage |
|-----------|----------|
| `session-lifecycle.test.ts` | Creation, status mirroring, concurrent updates |
| `status-definitions.test.ts` | Protected rules, deletion reassignment |
| `malfunctions.test.ts` | State machine transitions |
