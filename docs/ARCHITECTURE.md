# Gestelit Work Monitor - Architecture Reference

> Manufacturing floor real-time worker session tracking system
> Stack: Next.js 16 + React 19 + TypeScript + Supabase (PostgreSQL)
> Updated: December 2025

---

## Quick Reference

### Commands
```bash
npm run dev       # Development server (localhost:3000)
npm run build     # Production build
npm run test:run  # Run integration tests
npx supabase db push  # Apply migrations to remote
```

### Key Directories
```
app/(worker)/     # Worker flow: login → station → job → checklist → work
app/admin/        # Admin dashboard, history, management
app/api/          # Backend API routes (service role)
lib/data/         # Server-side Supabase queries
lib/api/          # Client-side API wrappers
lib/types.ts      # TypeScript domain types
tests/integration/  # Vitest integration tests
supabase/migrations/  # Database migrations
```

---

## 1. Core Concepts

### Domain Types
```typescript
SessionStatus: "active" | "completed" | "aborted"
MachineState: "production" | "setup" | "stoppage"
StatusScope: "global" | "station"
MalfunctionStatus: "open" | "known" | "solved"
```

### Authentication
| Actor | Method | Header |
|-------|--------|--------|
| Worker | Worker code lookup | `X-Worker-Code` |
| Admin | Password validation | `X-Admin-Password` |
| API Routes | Service role key | Bypasses RLS |

---

## 2. Database Schema

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `workers` | Worker metadata | `worker_code`, `full_name`, `is_active`, `department` |
| `stations` | Station definitions | `code`, `station_type`, `start_checklist`, `end_checklist`, `station_reasons` |
| `jobs` | Job metadata | `job_number`, `customer_name`, `planned_quantity` |
| `sessions` | Active work sessions | `worker_id`, `station_id`, `job_id`, `status`, `current_status_id` |
| `status_events` | Status timeline | `session_id`, `status_definition_id`, `started_at`, `ended_at` |
| `status_definitions` | Configurable statuses | `scope`, `station_id`, `label_he`, `machine_state`, `is_protected` |
| `malfunctions` | Malfunction records | `station_id`, `status`, `description` |

### Important Constraints

**Status Definitions:**
- `is_protected` column marks non-editable statuses (production, malfunction, other)
- `color_hex` constrained to 15 allowed palette values
- `scope` = 'station' requires `station_id`

**Malfunctions:**
- State machine trigger enforces: `open` → `known` → `solved`
- Invalid transitions (e.g., `solved` → `open`) rejected by database

**Sessions:**
- `current_status_id` FK to `status_definitions` with `ON DELETE RESTRICT`
- Snapshot columns preserve historical worker/station names

### Indexes
```sql
sessions_current_status_idx ON sessions(current_status_id)
sessions_job_idx ON sessions(job_id)
sessions_started_at_idx ON sessions(started_at)
malfunctions_status_idx ON malfunctions(status)
status_definitions_machine_state_idx ON status_definitions(machine_state)
```

---

## 3. Critical Patterns

### Atomic Status Mirroring
Status changes use `create_status_event_atomic()` PostgreSQL function:
1. Closes open status events for session
2. Inserts new status event
3. Updates `sessions.current_status_id` and `last_status_change_at`

**Usage in TypeScript:**
```typescript
await supabase.rpc("create_status_event_atomic", {
  p_session_id: sessionId,
  p_status_definition_id: statusId,
  p_note: note,
  // ... other params
});
```

### Session Lifecycle
```
Login → Station Select → Job Entry → Start Checklist → Active Work → End Checklist → Complete
         ↓                                    ↓
    Grace Period (5 min)              Heartbeat (15s)
         ↓                                    ↓
    Auto-abandon if expired          Auto-close if idle >5 min
```

### Snapshot vs FK Strategy
| Use Snapshots | Use FK Joins |
|---------------|--------------|
| Historical records | Active sessions |
| Completed session display | Real-time updates |
| Audit trails | Current worker/station info |

Snapshot columns: `worker_full_name_snapshot`, `worker_code_snapshot`, `station_name_snapshot`, `station_code_snapshot`

---

## 4. API Routes

### Worker Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/workers/login` | POST | Authenticate by worker code |
| `/api/workers/active-session` | GET | Get active session for recovery |
| `/api/sessions/heartbeat` | POST | Update `last_seen_at` |
| `/api/sessions/complete` | POST | Mark session completed |
| `/api/status-events` | POST | Create status event (uses atomic function) |

### Admin Routes (require `X-Admin-Password`)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/dashboard/active-sessions` | GET | All active sessions |
| `/api/admin/dashboard/active-sessions/stream` | GET | SSE real-time stream |
| `/api/admin/status-definitions` | GET/POST | List/create statuses |
| `/api/admin/status-definitions/[id]` | PUT/DELETE | Update/delete status |
| `/api/admin/sessions/close-all` | POST | Force-close all sessions |

### Cron Routes
| Route | Purpose |
|-------|---------|
| `/api/cron/close-idle-sessions` | Close sessions idle >5 minutes |

---

## 5. Data Layer

### Service Layer (`lib/data/`)
```typescript
// Sessions
createSession(payload)
startStatusEvent(payload)  // Uses atomic RPC
completeSession(sessionId)
abandonActiveSession(sessionId, reason)
getGracefulActiveSession(workerId)

// Status Definitions
fetchActiveStatusDefinitions(stationId?)
createStatusDefinition(payload)
deleteStatusDefinition(id)  // Reassigns to fallback

// Admin
fetchActiveSessions()
fetchRecentSessions(filters)
```

### Client Layer (`lib/api/`)
```typescript
// Auto-adds X-Worker-Code header
startStatusEventApi(sessionId, statusId)
completeSessionApi(sessionId)

// Auto-adds X-Admin-Password header
fetchActiveSessionsAdminApi()
createStatusDefinitionAdminApi(payload)
```

---

## 6. Testing

### Integration Tests (`tests/integration/`)
| File | Coverage |
|------|----------|
| `session-lifecycle.test.ts` | Session creation, status mirroring, concurrent updates |
| `status-definitions.test.ts` | Protected status rules, deletion reassignment, scoping |
| `malfunctions.test.ts` | State machine transitions |

### Test Utilities (`tests/helpers.ts`)
```typescript
TestFactory.createWorker(suffix)
TestFactory.createStation(suffix)
TestFactory.getProductionStatus()
TestCleanup.cleanupSessions(ids)
```

---

## 7. Security

### Row Level Security (RLS)
- Enabled on all tables
- Service role bypasses RLS (used by API routes)
- Anon key has limited read access (stations, jobs, status_definitions)

### Rate Limiting (Not Implemented)
Priority endpoints:
- `POST /api/sessions` - Session creation
- `POST /api/admin/login` - Admin authentication
- `POST /api/malfunctions` - Malfunction reports

### Session Security
- Heartbeat every 15 seconds
- 5-minute grace period for recovery
- UTC timestamps for all comparisons

---

## 8. Conventions

### Hebrew Text
- UTF-8 encoded, no BOM
- Output Hebrew literally (א–ת)
- No HTML entities or Unicode escapes

### Styling
- RTL-first: `dir="rtl"`
- shadcn/ui + Tailwind only
- No custom CSS frameworks

### Code Style
- Early returns for readability
- `handle` prefix for event handlers
- Const arrow functions

---

## 9. Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ADMIN_PASSWORD=<admin-password>
```

---

## 10. Common Operations

### Add New Status Definition
```typescript
await createStatusDefinition({
  scope: "global",  // or "station"
  station_id: null, // required if scope="station"
  label_he: "סטטוס חדש",
  color_hex: "#3b82f6",  // must be from allowed palette
  machine_state: "setup",  // production | setup | stoppage
});
```

### Create Session with Status Event
```typescript
const session = await createSession({
  worker_id,
  station_id,
  job_id,
});
// Initial status automatically set from first global status

await startStatusEvent({
  session_id: session.id,
  status_definition_id: productionStatusId,
});
```

### Handle Malfunction
```typescript
// Create malfunction
const malfunction = await createMalfunction({
  station_id,
  status: "open",
  description: "Machine stopped",
});

// Update status (enforced by trigger)
// Valid: open → known, open → solved, known → solved
// Invalid: solved → anything, known → open
```

---

## 11. Migrations Reference

| Migration | Purpose |
|-----------|---------|
| `20251215112227_enable_rls_policies.sql` | Enable RLS on all tables |
| `20251227233054_ensure_status_definitions.sql` | Idempotent table creation |
| `20251227233140_add_missing_indexes.sql` | Performance indexes |
| `20251227233201_add_protected_column.sql` | `is_protected` column |
| `20251227233225_atomic_status_event_function.sql` | Atomic status function |
| `20251227233718_station_type_constraint.sql` | Station type validation |
| `20251227233746_malfunction_state_machine.sql` | State machine trigger |
| `20251227233819_jsonb_validation.sql` | Checklist JSONB validation |

---

## 12. Troubleshooting

### Status Event Creation Fails
- Verify `status_definition_id` exists and is allowed for station
- Check `create_status_event_atomic` function exists in database
- Ensure session is active

### Protected Status Cannot Be Modified
- Check `is_protected` column in `status_definitions`
- Protected labels: אחר, ייצור, תקלה

### Malfunction Transition Rejected
- State machine enforces: open → known → solved
- Cannot revert from `solved` or `known` → `open`

### Session Not Closing
- Check `last_seen_at` timestamp
- Verify cron job is running
- Grace period is 5 minutes from last heartbeat
