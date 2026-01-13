# Gestelit Work Monitor - Architecture Reference

> System architecture, data flow, and key patterns
> Manufacturing floor real-time worker session tracking system
> Last updated: January 2026

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [System Architecture](#2-system-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Data Flow](#4-data-flow)
5. [Key Patterns](#5-key-patterns)
6. [Domain Model](#6-domain-model)
7. [Worker Flow](#7-worker-flow)
8. [Admin System](#8-admin-system)
9. [Commands](#9-commands)
10. [Related Documentation](#10-related-documentation)

---

## 1. Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router) | 16 |
| UI | React | 19 |
| Language | TypeScript | 5.x |
| Database | Supabase (PostgreSQL) | 17 |
| Styling | TailwindCSS | 3.x |
| Components | shadcn/ui | Latest |
| Testing | Vitest | 4.x |
| Charts | Recharts, vis-timeline | - |

**Language Direction:** RTL-first (Hebrew primary, Russian secondary)
**Path Alias:** `@/` resolves to project root

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐     │
│  │ Worker Pages  │   │ Admin Pages   │   │ Landing Page  │     │
│  │  app/(worker) │   │   app/admin   │   │     app/      │     │
│  └───────┬───────┘   └───────┬───────┘   └───────────────┘     │
│          │                   │                                   │
│  ┌───────┴───────────────────┴──────────────────────────────┐  │
│  │                  React Components                          │  │
│  │              (shadcn/ui + TailwindCSS)                    │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                    │
│  ┌──────────────────────────┴───────────────────────────────┐  │
│  │                 lib/api/client.ts                          │  │
│  │          (Client-side API wrappers, adds auth)            │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────────┘
                              │ HTTP
┌─────────────────────────────┼───────────────────────────────────┐
│                        API Layer                                 │
│  ┌──────────────────────────┴───────────────────────────────┐  │
│  │                    app/api/                                │  │
│  │            (Next.js API Routes, validates auth)           │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │                                    │
│  ┌──────────────────────────┴───────────────────────────────┐  │
│  │                    lib/data/                               │  │
│  │         (Business logic, Supabase queries)                │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────────┘
                              │ Service Role
┌─────────────────────────────┼───────────────────────────────────┐
│                     Database Layer                               │
│  ┌──────────────────────────┴───────────────────────────────┐  │
│  │                Supabase (PostgreSQL 17)                    │  │
│  │           Row Level Security + RPC Functions              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Directory Structure

```
app/
  (worker)/           # Worker flow pages
    login/            # Worker authentication
    job/              # Job entry
    station/          # Station selection (with production lines)
    checklist/        # Start/end checklists
    work/             # Active session
  admin/              # Admin dashboard and management
    _components/      # Admin-specific components
    history/          # Historical analytics
    manage/           # Entity management
    reports/          # Malfunction/general/scrap reports
    session/[id]/     # Session detail
  api/                # API routes

lib/
  data/               # Server-side Supabase queries
    sessions.ts       # Session lifecycle
    jobs.ts           # Job operations
    job-items.ts      # Production line items
    production-lines.ts
    stations.ts
    status-definitions.ts
    reports.ts
    workers.ts
    checklists.ts
    admin-dashboard.ts
    admin-management.ts
  api/                # Client-side API wrappers
    client.ts
    auth-helpers.ts
  auth/               # Authentication helpers
    permissions.ts
    admin-session.ts
  hooks/              # Realtime subscription hooks
  supabase/           # Client creation
  types.ts            # TypeScript types
  constants.ts        # App constants
  status.ts           # Status color utilities
  utils.ts            # General utilities

components/
  ui/                 # shadcn/ui components
  worker/             # Worker UI components
  work/               # Work page components
  forms/              # Form components
  layout/             # Layout components
  providers/          # Context providers

contexts/             # React contexts
  WorkerSessionContext.tsx
  PipelineContext.tsx
  AdminSessionsContext.tsx
  LanguageContext.tsx

hooks/                # Page-level hooks
  useSessionHeartbeat.ts
  useSessionBroadcast.ts
  useAdminGuard.ts

tests/integration/    # Vitest tests
supabase/migrations/  # Database migrations
docs/                 # Documentation
```

---

## 4. Data Flow

### Read Operations

```
Component → lib/api/client.ts → API Route → lib/data/*.ts → Supabase
```

### Write Operations (Standard)

```
Component → lib/api/client.ts → API Route → lib/data/*.ts → Supabase
```

### Write Operations (Atomic)

```
Component → API Route → lib/data/*.ts → Supabase RPC Function
```

Atomic operations (status changes, quantity updates) use PostgreSQL RPC functions to ensure transactional consistency.

### Real-Time Updates

```
Supabase → SSE Stream (API Route) → EventSource (Component) → State Update
```

Or:

```
Supabase Realtime → lib/hooks/useRealtime*.ts → State Update
```

---

## 5. Key Patterns

### Status Mirroring

`sessions.current_status_id` mirrors the latest status event for efficient dashboard queries:

```sql
-- Dashboard query: single table, no joins
SELECT * FROM sessions WHERE status = 'active';

-- Status change: atomic RPC ensures consistency
SELECT create_status_event_atomic(session_id, status_id, ...);
```

### Snapshot vs FK Join

| Use Case | Pattern |
|----------|---------|
| Active session display | FK join to workers, stations |
| Historical reports | Snapshot columns |
| Audit trails | Snapshot columns |
| Real-time dashboards | FK join |

Snapshot columns: `worker_full_name_snapshot`, `worker_code_snapshot`, `station_name_snapshot`, `station_code_snapshot`

### Production Line WIP

Balance-based tracking with LIFO corrections:

```
Session reports +10 good
  → Pull from upstream WIP (if available)
  → Record consumption in ledger
  → Add to current step balance
  → If terminal, increment completion

Session decreases -5 good
  → Check downstream hasn't consumed
  → Reduce originated first (no return)
  → Return pulled via LIFO
```

### Instance Tracking

Prevents same session in multiple tabs:

```typescript
// Each tab has unique instanceId
session.active_instance_id = instanceId;

// Heartbeat validates match
if (session.active_instance_id !== requestInstanceId) {
  throw new Error('INSTANCE_MISMATCH');
}
```

---

## 6. Domain Model

### Core Entities

```
Worker ─────────┬────────── Session ─────────┬────────── StatusEvent
                │                            │
                │                            ├────────── Report
                │                            │
Station ────────┤                            └────────── ChecklistResponse
                │
Job ────────────┴────────── JobItem ─────────┬────────── JobItemStation
                                             │
ProductionLine ──────────────────────────────┤
                                             │
                                             └────────── WipBalance
```

### Type Definitions

```typescript
// Session lifecycle
type SessionStatus = "active" | "completed" | "aborted"

// Status configuration
type MachineState = "production" | "setup" | "stoppage"
type StatusScope = "global" | "station"

// Reports
type ReportType = "malfunction" | "general" | "scrap"
type MalfunctionStatus = "open" | "known" | "solved"
type SimpleStatus = "new" | "approved"

// Production lines
type JobItemKind = "station" | "line"

// Checklists
type ChecklistKind = "start" | "end"
```

---

## 7. Worker Flow

Sequential progression through the application:

```
Login → Job Entry → Station Selection → Start Checklist → Work → End Checklist → Complete
```

### Key Features

| Feature | Implementation |
|---------|----------------|
| Session recovery | 5-minute grace period, `getGracefulActiveSession()` |
| Multi-tab prevention | `active_instance_id` + BroadcastChannel |
| Heartbeat | 15-second interval, updates `last_seen_at` |
| Idle detection | 5-minute threshold, cron-based cleanup |
| Status changes | Atomic via `create_status_event_atomic()` |
| Quantity updates | Atomic via `update_session_quantities_atomic_v2()` |

### Production Line Flow

When job has job items:
1. Show pipeline view with WIP distribution
2. Worker selects station within line
3. Session links to `job_item_id` and `job_item_station_id`
4. Quantities update WIP balances atomically

---

## 8. Admin System

### Dashboard Features

| Feature | Implementation |
|---------|----------------|
| Active sessions | SSE stream + Supabase subscription |
| Reports widget | Counts by type and status |
| Job progress | WIP distribution per station |
| KPI cards | Aggregated statistics |
| Session detail | Timeline visualization |

### Management Entities

- Workers (CRUD + station assignments)
- Stations (CRUD + checklists + reasons)
- Jobs (CRUD + job items)
- Status definitions (protected + custom)
- Production lines (station sequences)
- Report reasons (for general reports)

### Report Types

| Type | Status Flow | Purpose |
|------|-------------|---------|
| Malfunction | open → known → solved | Equipment issues |
| General | new → approved | Observations |
| Scrap | new → approved | Scrap tracking |

---

## 9. Commands

### Development

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint check
```

### Testing

```bash
npm run test:run     # Run tests once
npm run test         # Watch mode
npm run test -- tests/integration/file.test.ts  # Single file
```

### Database

```bash
npx supabase db push           # Apply migrations
npx supabase migration new X   # Create migration
```

---

## 10. Related Documentation

| Document | Description |
|----------|-------------|
| [README.md](./README.md) | Documentation index |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Complete database schema |
| [API_REFERENCE.md](./API_REFERENCE.md) | All API endpoints |
| [WORKER_FLOW.md](./WORKER_FLOW.md) | Worker application guide |
| [ADMIN_SYSTEM.md](./ADMIN_SYSTEM.md) | Admin dashboard guide |
| [PRODUCTION_LINES.md](./PRODUCTION_LINES.md) | WIP tracking system |
| [REALTIME_STREAMING.md](./REALTIME_STREAMING.md) | Real-time features |
| [AUTHENTICATION.md](./AUTHENTICATION.md) | Security patterns |
| [COMPONENTS.md](./COMPONENTS.md) | React components |
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | AI agent cheat sheet |

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ADMIN_PASSWORD=<admin-password>
```

---

## Conventions

### Hebrew Text
- UTF-8 encoded, no BOM
- Literal Hebrew characters (א-ת)
- No nikud (vowels)
- No HTML entities or Unicode escapes

### Styling
- RTL-first: root layout `dir="rtl"`
- shadcn/ui + TailwindCSS only
- No custom CSS frameworks
- Clean design: no gradients, blobs, glowing effects
- Neutral backgrounds, 1-2 accent colors

### Code Style
- Early returns for readability
- `handle` prefix for event handlers
- Const arrow functions over function declarations
- Tailwind classes only, no inline styles
