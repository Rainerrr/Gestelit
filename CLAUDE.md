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

### Supabase Migrations

```bash
npx supabase migration new <migration_name>  # Create new migration
npx supabase db push                         # Apply migrations to remote
```

Migrations are in `supabase/migrations/` with timestamp prefixes (YYYYMMDDHHMMSS).

## Architecture

### Tech Stack
- **Framework**: Next.js 16 (App Router) with React 19
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Styling**: TailwindCSS + shadcn/ui components
- **Language Direction**: RTL-first (Hebrew primary)

### Key Directories
- `app/(worker)/` - Worker-facing flow (login → station → job → checklist → work)
- `app/admin/` - Admin dashboard, history, management pages
- `app/api/` - Backend API routes (all use service role Supabase client)
- `lib/data/` - Server-side Supabase query functions (reusable across routes)
- `lib/api/` - Client-side API wrappers (auto-add auth headers)
- `lib/types.ts` - All TypeScript types for domain entities
- `contexts/` - React contexts (`WorkerSessionContext`, `LanguageContext`)
- `supabase/migrations/` - Database migrations (run via Supabase CLI)

### Authentication Pattern
- **Workers**: `X-Worker-Code` header validated server-side via `lib/auth/permissions.ts`
- **Admin**: Session cookie (`admin_session`, 15-min TTL) or `X-Admin-Password` header
- **Supabase**: API routes use `createServiceSupabase()` (service role bypasses RLS)

### Session Lifecycle
1. Login (worker code) → Station selection → Job entry → Start checklist → Active work → End checklist → Complete session
2. Worker can resume within 5-minute grace period if session still active
3. Heartbeat pings every 15 seconds; idle sessions auto-closed after 5 minutes

### Status Event System
- `status_definitions` table (configurable, not hardcoded enum)
- Two scopes: `global` (all stations) or `station` (station-scoped)
- Three machine states: `production`, `setup`, `stoppage`
- `sessions.current_status_id` mirrors latest status for efficient dashboard queries
- Status colors constrained to 15 allowed hex palette values
- Protected statuses (production, malfunction, other) marked with `is_protected` column

### Data Layer Pattern
- All Supabase queries centralized in `lib/data/` for reuse across API routes
- `startStatusEvent()` atomically: closes previous event, validates status, mirrors to sessions, logs new event
- Service role required for all data functions
- API routes in `app/api/` call functions from `lib/data/`
- Client-side code uses wrappers from `lib/api/client.ts` (auto-adds auth headers)

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

### Malfunction Tracking
Malfunctions link to status events and sessions. Status flow: `open` → `known` → `solved`.

State machine enforced by database trigger - invalid transitions (e.g., `solved` → `open`) are rejected.

### Storage
Image uploads use service role client via `lib/utils/storage.ts`. Max 5MB, type-validated.

## Domain Types (lib/types.ts)

Key types to understand:
- `SessionStatus`: `"active" | "completed" | "aborted"`
- `MachineState`: `"production" | "setup" | "stoppage"`
- `StatusScope`: `"global" | "station"`
- `ChecklistKind`: `"start" | "end"`
- `MalfunctionStatus`: `"open" | "known" | "solved"`

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-side only)
- `ADMIN_PASSWORD` - Admin authentication password

## RLS Migration

Migration `20251215112227_enable_rls_policies.sql` enables Row Level Security on all tables. Must run in all environments. API routes use service role to bypass RLS.

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
- `POST /api/malfunctions` - Malfunction reports (prevent spam)

### Authentication Model
- **Workers**: Identified by worker code (not secret). Assumes trusted internal network or VPN.
- **Admin**: Password-based with session cookies (15-min TTL). Consider adding 2FA for production.
- **Service Role**: All API routes bypass RLS using service role key. Ensure this key is never exposed to clients.

### Session Security
- Worker sessions use heartbeat mechanism (15s intervals)
- Grace period of 5 minutes allows session recovery after disconnect
- All timestamp comparisons use UTC to prevent timezone-based exploits
