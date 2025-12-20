# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gestelit Work Monitor - A manufacturing/production floor real-time worker session tracking and admin management system built with Next.js 16, React 19, TypeScript, and Supabase.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

No automated tests are configured. All testing is manual.

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
- `contexts/` - React contexts (`WorkerSessionContext`, `LanguageContext`)
- `supabase/migrations/` - Database migrations (run via Supabase CLI)

### Authentication Pattern
- **Workers**: `X-Worker-Id` header validated server-side via `lib/auth/permissions.ts`
- **Admin**: `X-Admin-Password` header validated against `ADMIN_PASSWORD` env var
- **Supabase**: API routes use `createServiceSupabase()` (service role bypasses RLS)

### Session Lifecycle
1. Login (worker code) → Station selection → Job entry → Start checklist → Active work → End checklist → Complete session
2. Worker can resume within 5-minute grace period if session still active
3. Heartbeat pings every 15 seconds; idle sessions auto-closed after 5 minutes

### Status Event System
- `status_definitions` table (configurable, not hardcoded enum)
- Two scopes: global (all stations) or station-scoped
- `sessions.current_status_id` mirrors latest status for efficient dashboard queries
- Status colors constrained to 15 allowed hex palette values

### Data Layer Pattern
- All Supabase queries centralized in `lib/data/` for reuse across API routes
- `startStatusEvent()` atomically: closes previous event, validates status, mirrors to sessions, logs new event
- Service role required for all data functions

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
- `handle` prefix for event handlers
- Const functions over function declarations

## Key Patterns

### Status Mirroring
When status events are created, `sessions.current_status_id` and `last_status_change_at` are automatically updated. Admin dashboards subscribe to `sessions` table only.

### Session Snapshots
At creation, worker/station names are captured as snapshots (`worker_full_name_snapshot`, `station_name_snapshot`) to preserve history if names change.

### Station-Scoped Reasons
Each station has `station_reasons` JSON array. Default "תקלת כללית" reason is always included server-side.

### Storage
Image uploads use service role client via `lib/utils/storage.ts`. Max 5MB, type-validated.

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-side only)
- `ADMIN_PASSWORD` - Admin authentication password

## RLS Migration

Migration `20251215112227_enable_rls_policies.sql` enables Row Level Security on all tables. Must run in all environments. API routes use service role to bypass RLS.
