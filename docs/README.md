# Gestelit Work Monitor - Documentation Index

> Comprehensive documentation for AI agents working with this codebase.
> Last updated: January 2026

## Project Overview

**Gestelit Work Monitor** is a real-time manufacturing floor worker session tracking and admin management system.

### Tech Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Database**: Supabase (PostgreSQL 17) with Row Level Security
- **Styling**: TailwindCSS + shadcn/ui components
- **Language**: RTL-first (Hebrew primary, Russian secondary)
- **Path Alias**: `@/` resolves to project root

### Quick Commands
```bash
npm run dev          # Development server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint check
npm run test:run     # Run integration tests once
npm run test         # Tests in watch mode
npx supabase db push # Apply migrations to remote
```

---

## Documentation Structure

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, data flow, key patterns |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Complete database tables, functions, triggers |
| [API_REFERENCE.md](./API_REFERENCE.md) | All API endpoints with request/response formats |
| [WORKER_FLOW.md](./WORKER_FLOW.md) | Worker application flow and session lifecycle |
| [ADMIN_SYSTEM.md](./ADMIN_SYSTEM.md) | Admin dashboard, management, reports |
| [PRODUCTION_LINES.md](./PRODUCTION_LINES.md) | Production lines, job items, WIP tracking |
| [REALTIME_STREAMING.md](./REALTIME_STREAMING.md) | Real-time updates, SSE streams, subscriptions |
| [AUTHENTICATION.md](./AUTHENTICATION.md) | Auth patterns, security, RLS policies |
| [COMPONENTS.md](./COMPONENTS.md) | React components, contexts, hooks |
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | AI agent cheat sheet and common patterns |

---

## Directory Structure

```
app/
  (worker)/           # Worker flow pages (login, station, job, checklist, work)
  admin/              # Admin dashboard, history, reports, management
  api/                # API routes (all use service role Supabase)

lib/
  data/               # Server-side Supabase queries (business logic)
  api/                # Client-side API wrappers (auto-add auth headers)
  auth/               # Authentication helpers and permissions
  hooks/              # Real-time subscription hooks
  types.ts            # TypeScript domain types
  constants.ts        # Session timeouts, heartbeat intervals

components/
  ui/                 # shadcn/ui base components
  worker/             # Worker-specific components
  forms/              # Form components
  layout/             # Layout components

contexts/             # React contexts (WorkerSession, Language, Pipeline)
hooks/                # Page-level React hooks
tests/integration/    # Vitest integration tests
supabase/migrations/  # Database migrations (YYYYMMDDHHMMSS_name.sql)
```

---

## Core Domain Types

```typescript
// Session states
type SessionStatus = "active" | "completed" | "aborted"

// Machine states for status definitions
type MachineState = "production" | "setup" | "stoppage"

// Status scope
type StatusScope = "global" | "station"

// Report types (unified system)
type ReportType = "malfunction" | "general" | "scrap"

// Report status flows
type MalfunctionReportStatus = "open" | "known" | "solved"  // state machine
type SimpleReportStatus = "new" | "approved"                 // one-way

// Checklist timing
type ChecklistKind = "start" | "end"

// Job item types
type JobItemKind = "station" | "line"

// Worker roles
type WorkerRole = "worker" | "admin"
```

---

## Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| Heartbeat interval | 15 seconds | `lib/constants.ts` |
| Idle threshold | 5 minutes | `lib/constants.ts` |
| Grace period | 5 minutes | `lib/constants.ts` |
| Admin session TTL | 15 minutes | `lib/auth/admin-session.ts` |

---

## Environment Variables

Required in `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ADMIN_PASSWORD=<admin-password>
```

---

## Agent Instructions

When working with this codebase:

1. **Read CLAUDE.md first** - Contains project-specific rules and conventions
2. **Follow data layer pattern** - All Supabase queries go in `lib/data/`, API routes call these
3. **Use service role** - API routes must use `createServiceSupabase()` to bypass RLS
4. **RTL-first** - Root layout has `dir="rtl"`, design for Hebrew first
5. **Hebrew text** - Write literal Hebrew characters, no Unicode escapes
6. **Atomic operations** - Use PostgreSQL RPC functions for multi-step transactions
7. **Status mirroring** - Always use `create_status_event_atomic()` for status changes

---

## File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Components | PascalCase | `StatusCard.tsx` |
| Utilities | camelCase | `formatTime.ts` |
| API routes | `route.ts` in directories | `app/api/sessions/route.ts` |
| Data layer | camelCase | `lib/data/sessions.ts` |
| Migrations | `YYYYMMDDHHMMSS_name.sql` | `20260110_add_wip.sql` |

---

## Testing

Integration tests run against live Supabase database:

```bash
# Run all tests
npm run test:run

# Run specific file
npm run test -- tests/integration/session-lifecycle.test.ts

# Watch mode
npm run test
```

Test files:
- `tests/integration/session-lifecycle.test.ts` - Session CRUD, status mirroring
- `tests/integration/status-definitions.test.ts` - Protected statuses, scoping
- `tests/integration/malfunctions.test.ts` - Report state machine

---

## Related Files

- `CLAUDE.md` - AI agent instructions (root of project)
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration with path aliases
