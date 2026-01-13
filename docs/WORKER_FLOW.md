# Worker Application Flow

> Complete guide to the worker-facing application
> Routes: `app/(worker)/`
> Last updated: January 2026

---

## Table of Contents

1. [Flow Overview](#1-flow-overview)
2. [Login Page](#2-login-page)
3. [Job Entry](#3-job-entry)
4. [Station Selection](#4-station-selection)
5. [Start Checklist](#5-start-checklist)
6. [Work Page](#6-work-page)
7. [End Checklist](#7-end-checklist)
8. [Session Recovery](#8-session-recovery)
9. [Multi-Tab Prevention](#9-multi-tab-prevention)
10. [Context & State](#10-context--state)

---

## 1. Flow Overview

```
┌─────────┐    ┌─────────┐    ┌─────────────┐    ┌──────────────┐
│  Login  │───►│   Job   │───►│   Station   │───►│    Start     │
│ /login  │    │  /job   │    │  /station   │    │  Checklist   │
└─────────┘    └─────────┘    └─────────────┘    │ /checklist/  │
                                                  │    start     │
                                                  └──────────────┘
                                                         │
┌─────────────┐    ┌─────────┐                           │
│    End      │◄───│  Work   │◄──────────────────────────┘
│  Checklist  │    │  /work  │
│ /checklist/ │    └─────────┘
│    end      │         │
└─────────────┘         │
       │                │
       ▼                ▼
┌─────────────────────────┐
│   Session Complete      │
│   Return to /login      │
└─────────────────────────┘
```

### Flow Rules
1. Sequential progression - no skipping steps
2. Single active session per worker (enforced by database)
3. Station occupancy tracked (one session per station)
4. Heartbeat every 15 seconds keeps session alive
5. Idle > 5 minutes triggers auto-close
6. 5-minute grace period allows session recovery

---

## 2. Login Page

**Route:** `/login`
**File:** `app/(worker)/login/page.tsx`

### Purpose
Worker authentication and session recovery detection.

### UI Elements
- Worker code input field
- Language selector (Hebrew/Russian)
- Login button

### Flow
```typescript
1. Worker enters code
2. POST /api/workers/login
3. If valid, check for active session: GET /api/workers/active-session
4. If session exists within grace period:
   - Show recovery dialog
   - Options: Resume or Discard
5. If no session or discarded:
   - Navigate to /job (with production lines) or /station (legacy)
```

### Recovery Dialog
Shows when worker has a recoverable session:
- Job information
- Station information
- Countdown timer to grace expiry
- "Resume" and "Discard" buttons

---

## 3. Job Entry

**Route:** `/job`
**File:** `app/(worker)/job/page.tsx`

### Purpose
Job number entry and validation.

### UI Elements
- Job number input
- Job details (if exists)
- Continue button

### Flow
```typescript
1. Worker enters job number
2. POST /api/jobs/validate
3. If job exists:
   - Show job details
   - Navigate to station selection
4. If job doesn't exist:
   - Create new job (getOrCreateJob)
   - Navigate to station selection
```

### Data Functions
- `lib/data/jobs.ts` - `getOrCreateJob()`

---

## 4. Station Selection

**Route:** `/station`
**File:** `app/(worker)/station/page.tsx`

### Purpose
Select workstation for the session. Supports both legacy (simple) and production line modes.

### Legacy Mode
- Shows stations assigned to worker via `worker_stations`
- Displays occupancy status
- Single selection

### Production Line Mode
- Shows job items (station or line type)
- Shows stations within production line steps
- Shows WIP availability at each step
- Filtered by worker assignment

### UI Elements
- Station cards with:
  - Station name/code
  - Occupancy indicator (occupied/available/grace period)
  - WIP available (production line mode)
  - Position in line (production line mode)
- Job item grouping (production line mode)

### API Calls
- `GET /api/stations/with-occupancy` - Legacy mode
- `POST /api/jobs/[jobId]/station-selection` - Production line mode

### Occupancy States
```typescript
interface StationOccupancy {
  isOccupied: boolean;
  occupiedByWorkerId: string | null;
  occupiedByWorkerName: string | null;
  isInGracePeriod: boolean;
  graceExpiresAt: string | null;
}
```

### Station Selection Logic
```typescript
// Worker can select station if:
// 1. Not occupied, OR
// 2. Occupied by same worker (reclaim), OR
// 3. In grace period and grace has expired
```

---

## 5. Start Checklist

**Route:** `/checklist/start`
**File:** `app/(worker)/checklist/start/page.tsx`

### Purpose
Pre-work safety/setup checklist completion.

### UI Elements
- Checklist items with checkboxes
- Required items marked
- Complete button (enabled when all required checked)

### Data Source
- `stations.start_checklist` JSONB field
- Fetched via `GET /api/checklists?stationId=X&kind=start`

### Flow
```typescript
1. Fetch start checklist for station
2. If empty, skip to /work
3. Worker checks items
4. POST /api/checklists/responses
5. Session flag: start_checklist_completed = true
6. Navigate to /work
```

---

## 6. Work Page

**Route:** `/work`
**File:** `app/(worker)/work/page.tsx`

### Purpose
Active session management - status tracking, quantity updates.

### UI Elements
- Current status display with color
- Status change buttons
- Good/Scrap counters with +/- buttons
- Session timer
- End session button (-> end checklist)

### Features

#### Status Changes
```typescript
// Worker selects new status
POST /api/status-events
{
  sessionId,
  statusDefinitionId,
  stationReasonId,  // For malfunctions
  note,
  imageUrl
}

// If status has report_type:
// - malfunction: Show malfunction form
// - general: Show general report form
```

#### Quantity Updates
```typescript
// Increment/decrement good or scrap
PATCH /api/sessions/quantities
{
  sessionId,
  totalGood: 101,  // New total
  totalScrap: 5
}
```

#### Heartbeat
```typescript
// Every 15 seconds while page active
POST /api/sessions/heartbeat
{
  sessionId,
  instanceId
}

// Also on page unload (sendBeacon)
```

### Hooks Used
- `useSessionHeartbeat` - 15s heartbeat
- `useSessionBroadcast` - Multi-tab detection
- `useLiveDuration` - Timer display

---

## 7. End Checklist

**Route:** `/checklist/end`
**File:** `app/(worker)/checklist/end/page.tsx`

### Purpose
Post-work checklist and scrap reporting.

### UI Elements
- Checklist items with checkboxes
- Scrap report section (if scrap > 0)
- Complete button

### Flow
```typescript
1. Fetch end checklist for station
2. If scrap > 0 and not reported:
   - Show scrap report form
   - Worker enters reason/description
3. Worker checks items
4. POST /api/checklists/responses
5. If scrap report needed: POST /api/reports (type: 'scrap')
6. Session flag: end_checklist_completed = true
7. POST /api/sessions/complete
8. Navigate to /login
```

---

## 8. Session Recovery

### Grace Period
- 5 minutes from last heartbeat
- Worker can resume session within this window

### Recovery Check Flow
```typescript
// On login
GET /api/workers/active-session

// Returns if within grace:
{
  session: { ... },
  station: { ... },
  job: { ... },
  graceExpiresAt: "2026-01-13T12:05:00Z"
}
```

### Recovery Actions

**Resume:**
```typescript
1. POST /api/sessions/takeover (with new instanceId)
2. Restore context from session data
3. Navigate to /work
```

**Discard:**
```typescript
1. POST /api/sessions/abandon (reason: "worker-abandon")
2. Clear context
3. Continue fresh flow
```

### Grace Period Calculation
```typescript
const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

const lastSeenUtc = new Date(session.last_seen_at).getTime();
const graceExpiresAt = lastSeenUtc + GRACE_PERIOD_MS;
const isWithinGrace = Date.now() < graceExpiresAt;
```

---

## 9. Multi-Tab Prevention

### Problem
Same session running in multiple browser tabs causes conflicts.

### Solution
- Each tab has unique `instanceId`
- Session stores `active_instance_id`
- Heartbeat validates instance match

### Implementation
```typescript
// Generate on page load
const instanceId = crypto.randomUUID();

// Store in session on creation/takeover
POST /api/sessions
{ ..., instanceId }

// Validate on heartbeat
POST /api/sessions/heartbeat
{ sessionId, instanceId }

// Response if mismatch:
{ error: "INSTANCE_MISMATCH" }
```

### User Experience
On mismatch:
1. Show "session transferred" message
2. Redirect to `/session-transferred`
3. Worker must reclaim session or start new

### BroadcastChannel
```typescript
// Tabs communicate via BroadcastChannel
const channel = new BroadcastChannel('worker-session');

// On session start, broadcast claim
channel.postMessage({ type: 'claim', sessionId, instanceId });

// Other tabs receive and can yield or show warning
```

---

## 10. Context & State

### WorkerSessionContext

**File:** `contexts/WorkerSessionContext.tsx`

```typescript
interface WorkerSessionContextValue {
  worker: Worker | null;
  session: Session | null;
  station: Station | null;
  job: Job | null;
  jobItem: JobItem | null;
  jobItemStation: JobItemStation | null;
  currentStatus: StatusDefinition | null;
  totalGood: number;
  totalScrap: number;

  setWorker: (worker: Worker | null) => void;
  setSession: (session: Session | null) => void;
  setStation: (station: Station | null) => void;
  setJob: (job: Job | null) => void;
  setJobItem: (item: JobItem | null) => void;
  setJobItemStation: (station: JobItemStation | null) => void;
  setCurrentStatus: (status: StatusDefinition | null) => void;
  setTotalGood: (count: number) => void;
  setTotalScrap: (count: number) => void;

  clearAll: () => void;
}
```

### PipelineContext

**File:** `contexts/PipelineContext.tsx`

For production line station selection:
```typescript
interface PipelineContextValue {
  jobItems: JobItem[];
  stationOptions: PipelineStationOption[];
  selectedStation: PipelineStationOption | null;
  setSelectedStation: (station: PipelineStationOption | null) => void;
}
```

### State Persistence
```typescript
// Session storage for recovery
// lib/utils/session-storage.ts

saveSessionToStorage({
  workerId,
  sessionId,
  stationId,
  jobId,
  jobItemId,
  jobItemStationId
});

loadSessionFromStorage();
clearSessionStorage();
```

---

## Key Files

### Pages
| File | Purpose |
|------|---------|
| `app/(worker)/login/page.tsx` | Worker login |
| `app/(worker)/job/page.tsx` | Job entry |
| `app/(worker)/station/page.tsx` | Station selection |
| `app/(worker)/checklist/start/page.tsx` | Pre-work checklist |
| `app/(worker)/work/page.tsx` | Active session |
| `app/(worker)/checklist/end/page.tsx` | Post-work checklist |
| `app/(worker)/session-transferred/page.tsx` | Session claim notice |

### Components
| File | Purpose |
|------|---------|
| `components/worker/station-block.tsx` | Station card |
| `components/worker/occupancy-indicator.tsx` | Occupancy status |
| `components/worker/job-item-card.tsx` | Job item display |
| `components/worker/production-line-stepper.tsx` | Line progress |
| `components/work/production-pipeline.tsx` | Pipeline view |
| `components/checklists/checklist-items.tsx` | Checklist UI |

### Hooks
| File | Purpose |
|------|---------|
| `hooks/useSessionHeartbeat.ts` | 15s heartbeat |
| `hooks/useSessionBroadcast.ts` | Multi-tab coordination |
| `lib/hooks/useLiveDuration.ts` | Timer display |

### Data Layer
| File | Purpose |
|------|---------|
| `lib/data/sessions.ts` | Session CRUD |
| `lib/data/jobs.ts` | Job operations |
| `lib/data/job-items.ts` | Job item & pipeline |
| `lib/data/stations.ts` | Station queries |
| `lib/data/checklists.ts` | Checklist responses |

---

## Constants

```typescript
// lib/constants.ts

export const HEARTBEAT_INTERVAL_MS = 15_000;  // 15 seconds
export const IDLE_THRESHOLD_MS = 5 * 60 * 1000;  // 5 minutes
export const GRACE_PERIOD_MS = 5 * 60 * 1000;  // 5 minutes
```
