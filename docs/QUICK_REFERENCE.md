# Quick Reference for AI Agents

> Cheat sheet for working with Gestelit Work Monitor codebase
> Use this as a fast lookup when implementing features or fixing bugs
> Last updated: January 2026

---

## Essential Patterns

### Data Layer Pattern (ALWAYS FOLLOW)

```
Client Component
    ↓
lib/api/client.ts (adds X-Worker-Code header)
    ↓
app/api/route.ts (validates auth, calls lib/data)
    ↓
lib/data/*.ts (Supabase queries with service role)
    ↓
Supabase (PostgreSQL)
```

**Key Rule:** Never query Supabase directly from components. Always go through API routes.

### Service Role Usage

```typescript
// In API routes ONLY
import { createServiceSupabase } from '@/lib/supabase/client';
const supabase = createServiceSupabase();
// This bypasses RLS
```

### Status Event Creation (ATOMIC)

```typescript
// ALWAYS use the RPC function, never direct insert
const { data } = await supabase.rpc('create_status_event_atomic', {
  p_session_id: sessionId,
  p_status_definition_id: statusId,
  p_station_reason_id: reasonId,
  p_note: note,
  p_image_url: imageUrl,
  p_report_id: reportId
});
```

### Quantity Updates (ATOMIC)

```typescript
// For sessions with production line tracking
const { data } = await supabase.rpc('update_session_quantities_atomic_v2', {
  p_session_id: sessionId,
  p_total_good: newGood,
  p_total_scrap: newScrap
});

// Returns: { success, error_code, session_id, total_good, total_scrap }
```

---

## Type Quick Reference

```typescript
// Session status
type SessionStatus = "active" | "completed" | "aborted"

// Machine states (for status definitions)
type MachineState = "production" | "setup" | "stoppage"

// Status scope
type StatusScope = "global" | "station"

// Reports
type ReportType = "malfunction" | "general" | "scrap"

// Malfunction flow: open → known → solved (or open → solved)
// General/Scrap flow: new → approved

// Checklist timing
type ChecklistKind = "start" | "end"

// Job items
type JobItemKind = "station" | "line"
```

---

## Directory Cheat Sheet

| Need to... | Look in... |
|------------|------------|
| Add API endpoint | `app/api/` |
| Add Supabase query | `lib/data/` |
| Add client API call | `lib/api/client.ts` |
| Add React component | `components/` |
| Add admin component | `app/admin/_components/` |
| Add worker page | `app/(worker)/` |
| Add admin page | `app/admin/` |
| Add database migration | `supabase/migrations/` |
| Add TypeScript type | `lib/types.ts` |
| Add React context | `contexts/` |
| Add custom hook | `hooks/` or `lib/hooks/` |

---

## Common Tasks

### Add New API Endpoint

```typescript
// 1. Create route file: app/api/example/route.ts
import { createServiceSupabase } from '@/lib/supabase/client';
import { getWorkerFromRequest } from '@/lib/auth/permissions';

export async function GET(request: Request) {
  try {
    // Auth
    const worker = await getWorkerFromRequest(request);

    // Query
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from('table')
      .select('*');

    if (error) throw error;
    return Response.json({ data });

  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error.code === 'UNAUTHORIZED' ? 401 : 500 }
    );
  }
}
```

### Add Data Layer Function

```typescript
// lib/data/example.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export async function fetchSomething(
  supabase: SupabaseClient,
  params: { id: string }
) {
  const { data, error } = await supabase
    .from('table')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error) throw error;
  return data;
}
```

### Add Client API Wrapper

```typescript
// lib/api/client.ts - add to existing file
export async function fetchSomethingApi(id: string) {
  const response = await fetch(`/api/example/${id}`, {
    headers: {
      'X-Worker-Code': getWorkerCode() || '',
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

### Add Database Migration

```bash
# Create migration file
npx supabase migration new my_feature

# Edit: supabase/migrations/YYYYMMDDHHMMSS_my_feature.sql

# Apply to remote
npx supabase db push
```

---

## Authentication Headers

```typescript
// Worker routes
headers: { 'X-Worker-Code': workerCode }

// Admin routes (option 1 - cookie automatic)
// Cookie: admin_session=<token>

// Admin routes (option 2 - header)
headers: { 'X-Admin-Password': password }
```

---

## Key Constants

```typescript
// lib/constants.ts
HEARTBEAT_INTERVAL_MS = 15_000    // 15 seconds
IDLE_THRESHOLD_MS = 5 * 60 * 1000  // 5 minutes
GRACE_PERIOD_MS = 5 * 60 * 1000    // 5 minutes
```

---

## Status Colors (Allowed)

```typescript
const ALLOWED_COLORS = [
  '#10b981', // Green
  '#f59e0b', // Amber
  '#f97316', // Orange
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#14b8a6', // Teal
  '#84cc16', // Lime
  '#eab308', // Yellow
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#0ea5e9', // Sky
  '#64748b', // Slate
  '#94a3b8', // Slate (light)
];
```

---

## Protected Status Labels (Cannot Modify)

| Hebrew | Russian | Machine State | Report Type |
|--------|---------|---------------|-------------|
| ייצור | Производство | production | none |
| תקלה | Неисправность | stoppage | malfunction |
| עצירה | Остановка | stoppage | general |
| אחר | Другое | stoppage | general |

---

## Common Queries

### Get Active Sessions

```typescript
const { data } = await supabase
  .from('sessions')
  .select(`
    *,
    worker:workers(*),
    station:stations(*),
    job:jobs(*),
    currentStatus:status_definitions(*)
  `)
  .eq('status', 'active');
```

### Get Status Events for Session

```typescript
const { data } = await supabase
  .from('status_events')
  .select(`
    *,
    status_definition:status_definitions(*)
  `)
  .eq('session_id', sessionId)
  .order('started_at', { ascending: true });
```

### Get Job Items with Progress

```typescript
const { data } = await supabase
  .from('job_items')
  .select(`
    *,
    progress:job_item_progress(*),
    stations:job_item_stations(*)
  `)
  .eq('job_id', jobId);
```

### Get WIP Balances

```typescript
const { data } = await supabase
  .from('wip_balances')
  .select(`
    *,
    station:job_item_stations(
      station_id,
      position,
      is_terminal,
      station:stations(name)
    )
  `)
  .eq('job_item_id', jobItemId);
```

---

## Error Handling Pattern

```typescript
// In API routes
try {
  // ... logic
} catch (error) {
  if (error.code === 'PGRST116') {
    // Row not found
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (error.message === 'INSTANCE_MISMATCH') {
    return Response.json({ error: 'Session transferred', code: 'INSTANCE_MISMATCH' }, { status: 409 });
  }
  if (error.message === 'WIP_DOWNSTREAM_CONSUMED') {
    return Response.json({ error: 'Cannot decrease', code: 'WIP_DOWNSTREAM_CONSUMED' }, { status: 409 });
  }
  return Response.json({ error: error.message }, { status: 500 });
}
```

---

## RTL & Hebrew Rules

1. **Root layout has `dir="rtl"`** - design right-to-left first
2. **Hebrew text literal** - write א-ת directly, no `\u05XX` escapes
3. **No nikud** - no vowel marks
4. **Labels on right** - form labels align right naturally
5. **Icons flip** - chevrons point opposite direction

---

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Component | PascalCase | `StatusCard.tsx` |
| Utility | camelCase | `formatTime.ts` |
| API route | `route.ts` | `app/api/sessions/route.ts` |
| Data layer | camelCase | `lib/data/sessions.ts` |
| Migration | YYYYMMDDHHMMSS | `20260113_add_feature.sql` |

---

## Test Commands

```bash
npm run test:run               # Run all tests once
npm run test                   # Watch mode
npm run test -- tests/integration/session-lifecycle.test.ts  # Single file
```

---

## Development Commands

```bash
npm run dev                    # Start dev server
npm run build                  # Production build
npm run lint                   # ESLint check
npx supabase db push           # Apply migrations
npx supabase migration new X   # Create migration
```

---

## Code Style Rules

From CLAUDE.md:
- Early returns for readability
- `handle` prefix for event handlers (`handleClick`)
- Const arrow functions over function declarations
- Tailwind classes only, no inline styles
- No emojis unless user requests
- No custom CSS frameworks
- No gradients, blobs, or glowing effects

---

## Quick Debug Checklist

**API not working?**
1. Check auth header present
2. Check service role being used
3. Check RLS policies

**Status not updating?**
1. Using `create_status_event_atomic`?
2. Check `current_status_id` mirroring

**Session not closing?**
1. Check `last_seen_at` timestamp
2. Check cron job running
3. Grace period is 5 minutes

**Quantities not saving?**
1. Using `update_session_quantities_atomic_v2`?
2. Check `WIP_DOWNSTREAM_CONSUMED` error
3. Check session has `job_item_id` set

**Worker can't select station?**
1. Check `worker_stations` assignment
2. Check station not occupied
3. Check station is active

---

## Key Files to Know

| Purpose | File |
|---------|------|
| Worker auth | `lib/auth/permissions.ts` |
| Admin auth | `lib/auth/admin-session.ts` |
| Supabase client | `lib/supabase/client.ts` |
| Types | `lib/types.ts` |
| Constants | `lib/constants.ts` |
| Status colors | `lib/status.ts` |
| Session operations | `lib/data/sessions.ts` |
| Job items | `lib/data/job-items.ts` |
| WIP logic | RPC `update_session_quantities_atomic_v2` |
| Status logic | RPC `create_status_event_atomic` |
