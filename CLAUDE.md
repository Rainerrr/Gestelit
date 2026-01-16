# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gestelit Work Monitor - A manufacturing/production floor real-time worker session tracking and admin management system built with Next.js 16, React 19, TypeScript, and Supabase.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Build for production
npm run lint     # Run ESLint
npm run test     # Run tests in watch mode
npm run test:run # Run tests once
```

### Testing
Integration tests use Vitest and run against the live Supabase database. Tests are in `tests/integration/`:
- `session-lifecycle.test.ts` - Session creation, status mirroring, concurrent updates
- `status-definitions.test.ts` - Protected status rules, deletion reassignment, scoping
- `malfunctions.test.ts` - State machine transitions (open/known/solved)
- `quantity-reporting.test.ts` - WIP updates and quantity tracking
- `worker-flow-job-selection.test.ts` - Job item binding and pipeline flow

Run a single test file:
```bash
npm run test -- tests/integration/session-lifecycle.test.ts
```

Test setup (`tests/setup.ts`) loads environment variables from `.env.local`.

### Supabase Migrations

```bash
npx supabase migration new <migration_name>  # Create new migration
npx supabase db push                         # Apply migrations to remote
```

Migrations are in `supabase/migrations/` with timestamp prefixes (YYYYMMDDHHMMSS).

> **DB Branch Restriction:** During development, all database work MUST be executed only on Supabase branch project `yzpwxlgvfkkidjsphfzv`. Never apply migrations to main until verified.

## Architecture

### Tech Stack
- **Framework**: Next.js 16 (App Router) with React 19
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Styling**: TailwindCSS + shadcn/ui components
- **Language Direction**: RTL-first (Hebrew primary)
- **Path Alias**: `@/` resolves to project root

### Key Directories
- `app/(worker)/` - Worker-facing flow (login → station → job → checklist → work)
- `app/admin/` - Admin dashboard, history, management pages
- `app/api/` - Backend API routes (all use service role Supabase client)
- `lib/data/` - Server-side Supabase query functions (reusable across routes)
- `lib/api/` - Client-side API wrappers (auto-add auth headers)
- `lib/types.ts` - All TypeScript types for domain entities
- `contexts/` - React contexts (`WorkerSessionContext`, `LanguageContext`, `PipelineContext`, `JobProgressContext`)
- `components/work/` - Worker session UI components (progress panel, dialogs, pipeline display)
- `components/worker/` - Worker flow components (job cards, station selection)
- `supabase/migrations/` - Database migrations (run via Supabase CLI)
- `docs/job-system-overhaul/` - Pipeline system implementation documentation

### Authentication Pattern
- **Workers**: `X-Worker-Code` header validated server-side via `lib/auth/permissions.ts`
- **Admin**: Session cookie (`admin_session`, 15-min TTL) or `X-Admin-Password` header
- **Supabase**: API routes use `createServiceSupabase()` (service role bypasses RLS)

### Session Lifecycle
1. Login (worker code) → Station selection → Job item selection → Start checklist → Active work → End checklist → Complete session
2. Job items bound to sessions via `job_item_step_id` (pipeline position)
3. Worker can resume within 5-minute grace period if session still active
4. Heartbeat pings every 15 seconds; idle sessions auto-closed after 5 minutes
5. Quantity reporting triggers WIP updates via `update_session_quantities_atomic_v3()`

### Status Event System
- `status_definitions` table (configurable, not hardcoded enum)
- Two scopes: `global` (all stations) or `station` (station-scoped)
- Three machine states: `production`, `setup`, `stoppage`
- `sessions.current_status_id` mirrors latest status for efficient dashboard queries
- Status colors constrained to 15 allowed hex palette values
- Protected statuses (production, malfunction, other) marked with `is_protected` column

### Data Layer Pattern
- All Supabase queries centralized in `lib/data/` for reuse across API routes
- Service role required for all data functions
- API routes in `app/api/` call functions from `lib/data/`
- Client-side code uses wrappers from `lib/api/client.ts` (auto-adds auth headers)

**PostgreSQL RPC Functions:**
- `create_status_event_atomic()` - Atomically closes previous event, inserts new event, mirrors to sessions
- `create_session_atomic()` - Creates session with job item binding in single transaction
- `update_session_quantities_atomic_v3()` - Updates WIP balances and job progress atomically
- `end_production_status_atomic_v4()` - Ends production status with quantity reporting
- `get_jobs_with_stats()` - Aggregates job data with session totals (good/scrap counts)
- `setup_job_item_pipeline()` - Creates job_item_steps from station array

**Key Data Modules:**
- `lib/data/sessions.ts` - Session lifecycle operations
- `lib/data/jobs.ts` - Job CRUD, aggregation for admin
- `lib/data/job-items.ts` - Job item queries, available jobs for station, WIP balances
- `lib/data/pipeline-presets.ts` - Pipeline preset CRUD, step management
- `lib/data/reports.ts` - Unified report system (malfunction/general/scrap), station grouping, view transformations
- `lib/data/status-definitions.ts` - Status configuration (global/station scoped)

## Cursor Rules (Important Conventions)

### Hebrew Text Handling
- UTF-8 encoded, no BOM
- Output Hebrew literally (א–ת), no nikud (vowels)
- No HTML entities or Unicode escapes (\u05E9)

### Styling Rules
- RTL-first: Root layout `dir="rtl"`, labels on right
- shadcn/ui foundation only (no custom CSS frameworks)
- Modern, clean design: no gradients, blobs, glowing effects
- Neutral backgrounds, 1–2 accent colors

### React/Frontend Rules
- Early returns for readability
- Tailwind classes only (no custom CSS)
- `handle` prefix for event handlers (handleClick, handleSubmit)
- Const arrow functions over function declarations

## Pipeline System (Job System Architecture)

The system uses a pipeline-based architecture for production tracking. Each job contains job items, and each job item has a pipeline of stations (steps) defining its production flow.

### Core Concepts

**Pipeline Presets:**
- Reusable templates for common production flows
- Stored in `pipeline_presets` + `pipeline_preset_steps` tables
- Stations can participate in multiple presets (no exclusivity)
- Admin manages via `/admin/manage` → Pipeline Presets tab

**Job Items:**
- Master production units with custom `name` and `planned_quantity`
- Each item has a pipeline defined by `job_item_steps`
- Optional `pipeline_preset_id` records provenance (which preset was used)
- `is_pipeline_locked` becomes true after first production event (immutable)

**Job Item Steps:**
- Represents a station position in a job item's pipeline
- `position` (1-indexed) defines order
- `is_terminal` marks the final station (where completed products are counted)
- Sessions bind to specific steps via `job_item_step_id`

### WIP (Work In Progress) Tracking

WIP flows through the pipeline:
1. **First station**: All GOOD products are "originated" (new inventory)
2. **Subsequent stations**: Products consumed from upstream `wip_balances`
3. **Terminal station**: GOOD increments `job_item_progress.completed_good`
4. **Corrections**: LIFO reversal via `wip_consumptions` ledger

**Key Tables:**
- `wip_balances` - Current inventory at each step
- `wip_consumptions` - Ledger of products consumed between steps
- `job_item_progress` - Aggregated completion stats per job item

### Session Totals vs Job Progress
- **Session totals**: Per-session quantities tracked in context (`good`, `scrap`)
- **Job item progress**: Aggregated across all sessions for the job item
- Session totals reset when switching job items (totals are per-job-item, not per-session)

### Database Schema (Pipeline)

```
pipeline_presets          job_items                  job_item_steps
├─ id                     ├─ id                      ├─ id
├─ name                   ├─ job_id                  ├─ job_item_id
├─ description            ├─ name (required)         ├─ station_id
├─ is_active              ├─ planned_quantity        ├─ position
└─ pipeline_preset_steps  ├─ pipeline_preset_id?     ├─ is_terminal
   ├─ station_id          ├─ is_pipeline_locked      └─ wip_balances
   └─ position            └─ is_active                  └─ balance (integer)
```

## Key Patterns

### Status Mirroring (Atomic)
Status events are created via the `create_status_event_atomic()` PostgreSQL function, which atomically:
1. Closes any open status events for the session
2. Inserts the new status event
3. Updates `sessions.current_status_id` and `last_status_change_at`

This eliminates race conditions between concurrent status updates. Admin dashboards subscribe to `sessions` table only.

### Session Snapshots vs FK Joins
The sessions table has both foreign keys and snapshot columns:

**Use snapshots for:**
- Historical records and reports
- Completed sessions display
- Audit trails where original names matter

**Use FK joins for:**
- Active session displays
- Real-time updates
- Current worker/station information

Snapshot columns: `worker_full_name_snapshot`, `worker_code_snapshot`, `station_name_snapshot`, `station_code_snapshot`

### Station-Scoped Reasons
Each station has `station_reasons` JSON array. Default "תקלת כללית" reason is always included server-side.

### Unified Reports System
Reports are the generalized tracking system (replacing legacy malfunctions). Three report types with distinct workflows:

**Report Types:**
- `malfunction` - Equipment issues; status flow: `open` → `known` → `solved` (state machine enforced by trigger)
- `general` - Observations/notes; status flow: `new` → `approved`
- `scrap` - Scrap reporting; status flow: `new` → `approved`

**Key relationships:**
- Reports link to `status_events` via `status_event_id` (tracks which status triggered the report)
- `lib/data/reports.ts` - All report CRUD, grouping functions, and view transformations
- Status definitions have `report_type` field (`none` | `malfunction` | `general`) to trigger automatic report creation

### Storage
Image uploads use service role client via `lib/utils/storage.ts`. Max 5MB, type-validated.

## Domain Types (lib/types.ts)

Key types to understand:
- `SessionStatus`: `"active" | "completed" | "aborted"`
- `MachineState`: `"production" | "setup" | "stoppage"`
- `StatusScope`: `"global" | "station"`
- `ChecklistKind`: `"start" | "end"`
- `ReportType`: `"malfunction" | "general" | "scrap"`
- `ReportStatus`: `"open" | "known" | "solved"` (malfunction) or `"new" | "approved"` (general/scrap)

**Pipeline Types:**
- `PipelinePreset` - Reusable pipeline template
- `PipelinePresetStep` - Step in a preset (station + position)
- `PipelinePresetWithSteps` - Preset with embedded steps
- `JobItem` - Production unit with `name`, `planned_quantity`, optional `pipeline_preset_id`
- `JobItemStep` - Station in a job item's pipeline (renamed from JobItemStation)
- `JobItemWithSteps` - Job item with embedded steps
- `WipBalance` - Current inventory at a job_item_step
- `ActiveJobItemContext` - Worker context for bound job item (includes `jobItemStepId`)

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-side only)
- `ADMIN_PASSWORD` - Admin authentication password

## RLS Migration

Migration `20251215112227_enable_rls_policies.sql` enables Row Level Security on all tables. Must run in all environments. API routes use service role to bypass RLS.

## Worker Session Contexts

**WorkerSessionContext (`contexts/WorkerSessionContext.tsx`):**
- Manages active session state (worker, station, job item, status)
- Provides `activeJobItem` with `jobItemStepId` for pipeline position
- Tracks `sessionTotals` (good/scrap) for current job item
- Exposes `updateTotals()` for quantity reporting
- Session totals reset when binding new job item

**PipelineContext (`contexts/PipelineContext.tsx`):**
- Provides pipeline data for current job item
- Includes steps, current position, upstream/downstream WIP balances
- Used by pipeline display components

**JobProgressContext (`contexts/JobProgressContext.tsx`):**
- Tracks job-level progress (reported vs remaining)
- Aggregates across all job items
- Used by progress panel components

## Key Worker Components

**Job Progress Panel (`components/work/job-progress-panel.tsx`):**
- Displays reported/remaining quantities
- Shows dual progress bar (completed vs target)
- Integrates pipeline position indicator for multi-station jobs

**Quantity Report Dialog (`components/work/quantity-report-dialog.tsx`):**
- Modal for reporting good/scrap quantities
- Supports total and additive modes
- Triggers WIP updates via API

**Job Selection Sheet (`components/work/job-selection-sheet.tsx`):**
- Lists available job items for current station
- Filters out current job item when switching
- Shows WIP status per item

**Pipeline Position Indicator (`components/work/pipeline-position-indicator.tsx`):**
- Visual display of pipeline flow with RTL direction
- Shows upstream WIP (products waiting to consume)
- Shows downstream WIP (products at next station)
- Highlights current station position

## Security Considerations

### HTTPS Requirement
All production deployments MUST use HTTPS. Authentication headers (`X-Worker-Code`, `X-Admin-Password`) are transmitted in plaintext and would be exposed over HTTP.

### Rate Limiting Strategy
Currently, no rate limiting is implemented at the application layer. For production hardening, consider:

1. **Vercel Edge Middleware** (recommended for Next.js):
   ```typescript
   // middleware.ts
   import { Ratelimit } from "@upstash/ratelimit";
   import { Redis } from "@upstash/redis";
   ```

2. **Supabase Edge Functions** with built-in rate limiting

3. **API Gateway** (Cloudflare, AWS API Gateway) in front of the application

**Priority endpoints for rate limiting:**
- `POST /api/sessions` - Session creation (prevent abuse)
- `POST /api/admin/login` - Admin authentication (prevent brute force)
- `POST /api/reports` - Report submissions (prevent spam)

### Authentication Model
- **Workers**: Identified by worker code (not secret). Assumes trusted internal network or VPN.
- **Admin**: Password-based with session cookies (15-min TTL). Consider adding 2FA for production.
- **Service Role**: All API routes bypass RLS using service role key. Ensure this key is never exposed to clients.

### Session Security
- Worker sessions use heartbeat mechanism (15s intervals)
- Grace period of 5 minutes allows session recovery after disconnect
- All timestamp comparisons use UTC to prevent timezone-based exploits
