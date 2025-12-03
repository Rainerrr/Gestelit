# Gestelit Work Monitor – Architecture Overview

> Updated: 2025‑12‑03  
> Context: Next.js 16 + React 19 (App Router), Tailwind, shadcn/ui, Supabase

## 1. High-Level Structure
- **Framework**: Next.js App Router under `app/`.
- **UI System**: TailwindCSS + shadcn/ui components (see `components/ui/`).
- **State & Context**: `contexts/WorkerSessionContext.tsx` stores worker/station/job/session state plus production totals and checklist completion flags. Language context lives in `contexts/LanguageContext.tsx`.
- **Data Layer**: Supabase (Postgres + Realtime). Browser client (`lib/supabase/client.ts`) for frontend; service client for API routes.
- **API Routes**: Located under `app/api/**` and act as the backend layer (session management, checklists, reasons, etc.).
- **i18n**: Minimal translation helper in `lib/i18n/translations.ts` with Hebrew-first copy.

## 2. Worker Flow (App Router under `app/(worker)/`)
1. **Login (`/login`)** → Worker record stored in context via `useWorkerSession`.
2. **Station select (`/station`)** → persists station info.
3. **Job input (`/job`)**  
   - Calls `POST /api/jobs`.  
   - API ensures job exists + creates a `sessions` row.  
   - Context stores `sessionId` (and last-known `started_at` if available).
4. **Opening checklist (`/checklist/start`)**
   - Loads checklist via `fetchChecklistApi`.
   - On submit:  
     - Calls `POST /api/checklists/responses`.  
     - Server (route) saves the responses and marks the session as officially started (`markSessionStarted`).  
     - Response returns the session; UI stores `sessionStartedAt`.  
     - Fires `startStatusEventApi` with default `"stopped"` state, updates context, and routes to `/work`.
5. **Active Work (`/work`)**
   - Timer (`WorkTimer`) uses `sessionStartedAt` to render absolute elapsed time.  
   - Status buttons call `startStatusEventApi` and optimistically update `currentStatus` in context.  
   - Production counters call `updateSessionTotalsApi`.
6. **Closing checklist (`/checklist/end`)**
   - Saves responses, calls `completeSessionApi`, marks checklist state in context.
   - Flow then resets session (via context `reset`) and sends worker back to station picker.

## 3. Admin Dashboard (`/admin`)
- **Access**: Landing page (`app/page.tsx`) exposes a dialog with mock password `1234`. When correct, it sets `localStorage.isAdmin` and redirects to `/admin`.
- **Guard**: `hooks/useAdminGuard.ts` watches `localStorage` via `useSyncExternalStore` and redirects unauthorized visitors to `/`.
- **Layout**: `app/admin/_components/admin-dashboard.tsx` mimics the shadcn dashboard (sidebar + header + KPI row + content grid).
- **Data Source**: `lib/data/admin-dashboard.ts`.
  - `fetchActiveSessions()` – `sessions` join with workers/stations/jobs + derived status via latest `status_events`.  
  - `fetchRecentSessions()` – Completed sessions for the history table.  
  - Realtime:
    - `subscribeToActiveSessions()` listens to `sessions` inserts/updates where `status='active'`.  
    - `sessions.current_status` mirrors the latest `status_events` row so the dashboard refreshes via a single channel.
- **UI Components**:
  - `KpiCards`: counts for total active jobs, machines in production, machines stopped/faulted, total good output.
  - `ActiveSessionsTable`: detailed table with color-coded status badges and live HH:MM:SS runtime.
  - `StatusCharts`: Recharts vertical bar charts for status distribution + throughput by station.
  - `RecentSessionsTable`: shows recently completed sessions (duration, finish time, last status, good/scrap).
- **Utilities**: “סגירת כל העבודות הפעילות” button hits `POST /api/admin/sessions/close-all` (service key route) to force-complete all active sessions for QA/demo resets.

## 4. Supabase Schema (key tables)
- `workers` – worker metadata (`worker_code`, `full_name`, `language`, `role`).
- `stations` – station definitions + JSON checklists.
- `jobs` – job metadata (`job_number`, customer info).
- `sessions` – active work sessions (links worker/station/job). Fields used today: `status`, `started_at`, `ended_at`, totals, and checklist flags (`start_checklist_completed`, `end_checklist_completed`).
- `status_events` – timeline of state changes (`setup`, `production`, `stopped`, `fault`, `waiting_client`, `plate_change`).

## 5. Recent Architecture Changes (Dec 3, 2025)
1. **Admin Dashboard MVP**  
   - Added `/admin` route, RTL layout, KPIs, realtime active sessions table, charts, and recent sessions panel.  
   - Hooked to Supabase Realtime for `sessions` and `status_events`.
2. **Mock Admin Access**  
   - Landing page “כניסת מנהל” dialog with password `1234` storing `localStorage.isAdmin`.
3. **Timer Synchronization**  
   - Worker timer now uses persisted `sessionStartedAt`.  
   - Admin timer uses server-side `started_at` with 1-second updates.
4. **Checklist & Session Start Flow**  
   - Start checklist submission now:  
     1. Validates client-side that all required checklist items are checked.  
     2. Server marks session officially started via `markSessionStarted` and sets `start_checklist_completed = true` on the `sessions` row.  
     3. Client sets start timestamp and sends default `"stopped"` status event.  
   - No individual checklist answers are persisted; only the fact that the start checklist was completed.
5. **Realtime Status Reliability**  
   - Restored `status_events` subscription to avoid missing state changes; admin now responds instantly when workers switch statuses without needing production count updates.
6. **Force-Close Utility**  
   - `/api/admin/sessions/close-all` to terminate stuck sessions during demos/tests.
7. **Session Lifecycle Guard**  
   - Workers ping `/api/sessions/heartbeat` every 15 שניות ושולחים `navigator.sendBeacon` בזמן סגירת הטאב כך ש־`last_seen_at` נשאר מעודכן.  
   - Supabase cron (`close-idle-sessions`) מסיים עבודות שלא נראו במשך יותר מ־5 דקות, מסמן `forced_closed_at`, ומעדכן סטטוס ל־`stopped`.  
   - מסך הכניסה של העובד מציע דיאלוג “חזרה לעבודה פעילה” עם טיימר של 5 דקות שמאפשר להמשיך עבודה פתוחה לפני שהיא תיסגר אוטומטית.  
   - כל שינוי סטטוס מעדכן את שדות `current_status` ו־`last_status_change_at` בטבלת `sessions`, כדי שמסך המנהלים יקבל נתוני Realtime דרך ערוץ אחד.

## 6. Known Issues / Follow-ups
- **Lint noise**: Several legacy `.cjs` scripts still use `require`, triggering ESLint errors. Worker `work/page.tsx` still imports `Separator`/`Input` that aren’t used.
- **Security**: Admin auth remains mock-only (localStorage flag). Real RBAC/auth still needed.
- **Schema drift**: Recent attempts to add `current_status` column were reverted; status derivation still relies on `status_events`. If you reintroduce a column, ensure Supabase migrations run in all environments.
- **Realtime load**: `subscribeToActiveSessions` triggers full refetches on every insert/update. Consider differential updates or edge functions if scaling becomes an issue.
- **Testing**: No automated tests yet; all flows rely on manual verification.

## 7. Tips for Next Agent
- Keep RTL/Hebrew-first UI rules in mind (dir="rtl", Hebrew labels, no escaped text).
- Prefer shadcn ui primitives + Tailwind; avoid custom CSS files.
- When touching supabase data, confirm migrations match schema (see `supabase/schema.sql`).
- Reuse existing hooks (`useWorkerSession`, `useAdminGuard`) to avoid duplicating logic.
- For realtime work, share the singleton browser Supabase client (`getBrowserSupabaseClient`) to avoid multiple websocket connections.


