# Session Architecture

> Updated: 2025‑12‑03  
> Scope: Session persistence, lifecycle APIs, client state, monitoring, and automated enforcement

## 1. End-to-End Flow (Worker Perspective)

```
worker login → station selection → job entry
  ↳ POST /api/jobs
      └─ createSession() inserts row in sessions
        ↳ sessionId stored in WorkerSessionContext
opening checklist (/checklist/start)
  ↳ POST /api/checklists/responses (kind=start)
      └─ markSessionStarted() marks start_checklist_completed + started_at
      └─ POST /api/status-events (default "stopped")
active work (/work)
  ↳ startStatusEventApi / updateSessionTotalsApi / useSessionHeartbeat
closing checklist (/checklist/end)
  ↳ POST /api/checklists/responses (kind=end)
  ↳ POST /api/sessions/complete
post-session
  ↳ WorkerSessionContext.reset(), worker can start a new job
```

The worker UI keeps only lightweight, optimistic state in `contexts/WorkerSessionContext.tsx`. All authoritative data (session lifecycle, status transitions, production totals, checklist completion flags) is stored in Supabase.

## 2. Storage Model (Supabase)

| Table | Purpose | Key Columns |
| ----- | ------- | ----------- |
| `workers` | Operator directory (`worker_code`, `full_name`, `language`, `role`). | `id`, `worker_code`, `language` |
| `stations` | Machine metadata + embedded checklists. | `start_checklist jsonb`, `end_checklist jsonb`, `station_type` |
| `jobs` | Production job records (created on demand). | `job_number`, `customer_name`, `planned_quantity` |
| `sessions` | Core session record linking worker, station, job. | `worker_id`, `station_id`, `job_id`, `status`, `started_at`, `ended_at`, `total_good`, `total_scrap`, `start_checklist_completed`, `end_checklist_completed`, `last_seen_at`, `forced_closed_at`, `current_status`, `last_status_change_at` |
| `status_events` | Timeline of operating states for each session. | `session_id`, `status` (`setup`, `production`, `stopped`, etc.), `reason_id`, `note`, `started_at`, `ended_at` |
| `reasons` | Categorized stop/scrap reasons used when logging status events. | `type` (`stop`/`scrap`), `label_he`, `label_ru` |

### Session Columns in Detail

- **Lifecycle**: `status` (`session_status` enum), `started_at`, `ended_at`, `forced_closed_at`.
- **Production Totals**: `total_good`, `total_scrap` (updated via `/api/sessions/quantities`).
- **Checklist Flags**: `start_checklist_completed`, `end_checklist_completed` (set via `/api/checklists/responses`).
- **Heartbeat**: `last_seen_at` (bumped by `/api/sessions/heartbeat`), used by the idle-close edge function.
- **Status Mirror**: `current_status`, `last_status_change_at` mirror the latest `status_events` row so admin dashboards only need a single table subscription.

All migrations live in `supabase/migrations/**`. Notable files:

- `20250101000000_base_schema.sql` – base tables/enums.
- `20251203120000_add_session_heartbeat_columns.sql` – adds `last_seen_at`, `forced_closed_at`.
- `20251203121500_add_session_status_columns.sql` – mirrors event status fields on `sessions`.
- `20251203130000_add_session_checklist_flags.sql` – switches checklist tracking to boolean flags (responses no longer stored).

## 3. Server Interfaces & Service Layer

API routes under `app/api/**` form the backend boundary. Each route uses the service-role Supabase client (`lib/supabase/client.ts`) through helper functions in `lib/data/**`.

| Route | File | Responsibility | Core Helper |
| ----- | ---- | -------------- | ----------- |
| `POST /api/jobs` | `app/api/jobs/route.ts` | Ensures job exists (`getOrCreateJob`) and creates a fresh session. Returns `{ job, session }`. | `createSession()` |
| `POST /api/checklists/responses` | `app/api/checklists/responses/route.ts` | Marks `start_checklist_completed` or `end_checklist_completed` and (for start) records official `started_at`. | `markSessionStarted()`, `markEndChecklistCompleted()` |
| `POST /api/status-events` | `app/api/status-events/route.ts` | Closes any open event, inserts new event, mirrors status on `sessions`. | `startStatusEvent()` |
| `POST /api/sessions/quantities` | `app/api/sessions/quantities/route.ts` | Updates `total_good` / `total_scrap`. | `updateSessionTotals()` |
| `POST /api/sessions/heartbeat` | `app/api/sessions/heartbeat/route.ts` | Accepts JSON/text payload from `useSessionHeartbeat` and updates `last_seen_at`. | `recordSessionHeartbeat()` |
| `POST /api/sessions/complete` | `app/api/sessions/complete/route.ts` | Marks `status=completed`, sets `ended_at`. | `completeSession()` |
| `GET /api/workers/active-session` | `app/api/workers/active-session/route.ts` | Restores any unfinished session when worker logs back in. | `fetchActiveSessionForWorker()` |
| `POST /api/admin/sessions/close-all` | `app/api/admin/sessions/close-all/route.ts` | Force-completes any lingering active sessions (demo reset). | direct Supabase update |

`lib/data/sessions.ts` centralizes all mutations so both API routes and background tasks stay consistent (closing open status events, mirroring status fields, error handling).

## 4. Client Runtime State

### Worker Apps (`app/(worker)/**`)

- `WorkerSessionContext` tracks the logged-in worker, selected station, active job, `sessionId`, `sessionStartedAt`, optimistic `currentStatus`, counters, and checklist completion flags.
- `useSessionHeartbeat` (15s interval + `navigator.sendBeacon` fallback) keeps `last_seen_at` fresh while `/work` is open.
- Flow highlights:
  - `/station` picks the machine (stations are filtered per worker via worker/station relations in Supabase).
  - `/job` calls `createJobSessionApi`, storing session metadata in context.
  - `/checklist/start` fetches `stations.start_checklist`, submits, marks start.
  - `/work` drives status buttons and production counters (status -> `/api/status-events`, totals -> `/api/sessions/quantities`).
  - `/checklist/end` finalizes, calls `/api/sessions/complete`, then resets context.

### Admin Dashboard (`app/admin`)

- Uses the browser Supabase client (`getBrowserSupabaseClient`) directly.
- `lib/data/admin-dashboard.ts` fetches active/recent sessions and subscribes to `postgres_changes` on `sessions`.
- Because `sessions.current_status` and `last_status_change_at` are mirrored, admins only need a single table subscription instead of joining live `status_events`.

## 5. Observability & Automation

1. **Realtime**  
   - Workers mutate `sessions` + `status_events`; admins subscribe to `sessions` via `supabase.channel("admin-active-sessions")`.  
   - Any insert/update that affects an active row triggers a refresh (see `subscribeToActiveSessions()`).

2. **Heartbeat Enforcement**  
   - Client: `useSessionHeartbeat` pings `/api/sessions/heartbeat`.  
   - Server: `recordSessionHeartbeat()` updates `last_seen_at`.  
   - Edge function `supabase/functions/close-idle-sessions/index.ts` runs on a Supabase schedule, closing sessions idle for >5 minutes. It:
     - Ends any unfinished status events.
     - Inserts an `"stopped"` event with `note: "auto-abandon"`.
     - Marks `status="completed"`, `forced_closed_at`, and `current_status="stopped"` on `sessions`.

3. **Checklist Guarantees**  
   - Start/end checklist answers are not stored; only completion flags exist.  
   - UI enforces required items before enabling submit.  
   - Backend marks flags to prevent duplicate submissions and to gate later steps (work screen expects `start_checklist_completed`, admin summaries rely on `end_checklist_completed`).

4. **Recovery Flow**  
   - `/api/workers/active-session` lets a worker resume if a tab was closed or heartbeat temporarily failed.  
   - On resume, UI surfaces a reminder (5-minute grace) before the idle-close job ends the session.

## 6. Responsibilities by Layer

- **Database (Supabase/Postgres)**  
  Authoritative single source of truth for sessions, jobs, stations, status history, and heartbeat timestamps.

- **API Routes (Next.js App Router)**  
  Trust boundary around Supabase: validate payloads, orchestrate multi-step mutations (e.g., mark session started + log default status).

- **Service Helpers (`lib/data/**`)**  
  Encapsulate Supabase queries and make it trivial to reuse logic between routes (and potential future edge functions).

- **Client SDK (`lib/api/client.ts`)**  
  Fetch wrappers with consistent error handling; used throughout worker UI components and hooks.

- **React Context / Hooks**  
  Provide optimistic UX, local timers, and forms while delegating persistence to the API.

- **Supabase Edge Function**  
  Ensures data cleanliness and prevents zombie sessions via scheduled enforcement.

## 7. Key Files & References

- Database schema: `supabase/migrations/**`, `supabase/schema.sql`
- Session helpers: `lib/data/sessions.ts`
- Worker context + heartbeat: `contexts/WorkerSessionContext.tsx`, `hooks/useSessionHeartbeat.ts`
- Worker UI workflow: `app/(worker)/login`, `station`, `job`, `checklist/*`, `work`
- Admin monitoring: `app/admin/_components/*`, `lib/data/admin-dashboard.ts`
- API contracts: `app/api/**` (routes listed above)
- Background enforcement: `supabase/functions/close-idle-sessions/index.ts`

This markdown captures every layer that touches sessions—storage schema, API shape, client usage, realtime observability, and automated cleanup—so new contributors can reason about the lifecycle end-to-end.

