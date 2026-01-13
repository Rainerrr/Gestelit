# Authentication & Security

> Authentication patterns, authorization, and security considerations
> Last updated: January 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Worker Authentication](#2-worker-authentication)
3. [Admin Authentication](#3-admin-authentication)
4. [Service Role Pattern](#4-service-role-pattern)
5. [Row Level Security](#5-row-level-security)
6. [Session Security](#6-session-security)
7. [Security Considerations](#7-security-considerations)
8. [Implementation Files](#8-implementation-files)

---

## 1. Overview

The system uses three authentication models:

| Actor | Method | Trust Level |
|-------|--------|-------------|
| Worker | `X-Worker-Code` header | Internal network |
| Admin | Session cookie / header | Password verified |
| API Routes | Service role key | Full database access |

**Key Principle:** All API routes use the Supabase service role key, which bypasses Row Level Security. Authorization is handled at the application layer.

---

## 2. Worker Authentication

### Flow

```typescript
1. Worker enters code on /login
2. POST /api/workers/login { workerCode: "ABC123" }
3. Server validates code against workers table
4. If valid and is_active=true, return worker data
5. Client stores worker code in localStorage
6. Subsequent requests include X-Worker-Code header
```

### Header Format
```
X-Worker-Code: ABC123
```

### Client-Side Storage

**File:** `lib/api/auth-helpers.ts`

```typescript
const WORKER_CODE_KEY = 'worker_code';

export function setWorkerCode(code: string) {
  localStorage.setItem(WORKER_CODE_KEY, code);
}

export function getWorkerCode(): string | null {
  return localStorage.getItem(WORKER_CODE_KEY);
}

export function clearWorkerCode() {
  localStorage.removeItem(WORKER_CODE_KEY);
}
```

### Server-Side Validation

**File:** `lib/auth/permissions.ts`

```typescript
export async function getWorkerFromRequest(request: Request): Promise<Worker> {
  const workerCode = request.headers.get('X-Worker-Code');

  if (!workerCode) {
    throw new AuthError('Missing worker code', 'UNAUTHORIZED');
  }

  const supabase = createServiceSupabase();
  const { data: worker, error } = await supabase
    .from('workers')
    .select('*')
    .eq('worker_code', workerCode)
    .eq('is_active', true)
    .single();

  if (error || !worker) {
    throw new AuthError('Invalid worker code', 'UNAUTHORIZED');
  }

  return worker;
}
```

### Security Notes
- Worker codes are not secrets - they identify workers
- Assumes trusted internal network or VPN
- No password required - suitable for factory floor
- Rate limiting recommended for production

---

## 3. Admin Authentication

### Login Flow

```typescript
1. Navigate to /admin
2. If no valid session, show login dialog
3. POST /api/admin/auth/login { password }
4. Server validates against ADMIN_PASSWORD env var
5. Server sets HttpOnly cookie with session token
6. Cookie expires in 15 minutes
7. Cookie auto-refreshed on API calls
```

### Cookie Details
```
Name: admin_session
Value: <uuid-token>
HttpOnly: true
Secure: true (in production)
SameSite: Strict
MaxAge: 900 (15 minutes)
```

### Alternative Header
```
X-Admin-Password: <password>
```
For programmatic access or testing.

### Server Implementation

**File:** `lib/auth/admin-session.ts`

```typescript
const ADMIN_SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface AdminSession {
  token: string;
  expiresAt: number;
}

// Session store (in-memory for single instance)
const sessions = new Map<string, AdminSession>();

export function createAdminSession(): string {
  const token = crypto.randomUUID();
  sessions.set(token, {
    token,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function validateAdminSession(token: string): boolean {
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  // Refresh TTL
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return true;
}

export function invalidateAdminSession(token: string) {
  sessions.delete(token);
}
```

### Validation Helper

**File:** `lib/auth/permissions.ts`

```typescript
export async function requireAdmin(request: Request): Promise<void> {
  // Check header first
  const headerPassword = request.headers.get('X-Admin-Password');
  if (headerPassword === process.env.ADMIN_PASSWORD) {
    return;
  }

  // Check session cookie
  const cookies = request.headers.get('cookie');
  const sessionToken = parseCookie(cookies, 'admin_session');

  if (sessionToken && validateAdminSession(sessionToken)) {
    return;
  }

  throw new AuthError('Admin authentication required', 'UNAUTHORIZED');
}
```

---

## 4. Service Role Pattern

### Why Service Role?

All API routes use the Supabase service role key because:
1. RLS policies are enabled on all tables
2. Workers/admin don't have Supabase accounts
3. Authorization is handled in application code
4. Simplifies query logic

### Implementation

**File:** `lib/supabase/client.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

// Service role client - bypasses RLS
export function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Browser client - for realtime subscriptions only
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### Usage in API Routes

```typescript
// app/api/example/route.ts
import { createServiceSupabase } from '@/lib/supabase/client';
import { getWorkerFromRequest } from '@/lib/auth/permissions';

export async function GET(request: Request) {
  // 1. Authenticate
  const worker = await getWorkerFromRequest(request);

  // 2. Create service client
  const supabase = createServiceSupabase();

  // 3. Query with full access
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('worker_id', worker.id);

  return Response.json({ sessions: data });
}
```

---

## 5. Row Level Security

### RLS Status
All tables have RLS enabled via migration `20251215112227_enable_rls_policies.sql`.

### Policy Pattern
Since all API access uses service role:
```sql
-- Default deny all
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically
-- No explicit policies needed for API access

-- For browser subscriptions (anon key), grant read:
CREATE POLICY "Allow anon read sessions"
  ON sessions FOR SELECT
  USING (true);
```

### Tables with RLS
- workers
- stations
- worker_stations
- jobs
- sessions
- status_definitions
- status_events
- reports
- report_reasons
- checklist_responses
- production_lines
- production_line_stations
- job_items
- job_item_stations
- job_item_progress
- wip_balances
- wip_consumptions

---

## 6. Session Security

### Instance Tracking

Prevents same session in multiple tabs:

```typescript
// Each browser tab generates unique ID
const instanceId = crypto.randomUUID();

// Stored in session on creation
sessions.active_instance_id = instanceId;

// Validated on every heartbeat
if (session.active_instance_id !== requestInstanceId) {
  throw new Error('INSTANCE_MISMATCH');
}
```

### Grace Period

5-minute window to recover dropped sessions:

```typescript
const GRACE_PERIOD_MS = 5 * 60 * 1000;

const lastSeen = new Date(session.last_seen_at).getTime();
const graceExpiry = lastSeen + GRACE_PERIOD_MS;
const isWithinGrace = Date.now() < graceExpiry;
```

### Idle Timeout

Sessions auto-close after 5 minutes idle:

```typescript
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

// Cron job checks every minute
POST /api/cron/close-idle-sessions

// Finds sessions where:
status = 'active'
AND last_seen_at < now() - IDLE_THRESHOLD
```

### Session Takeover

Worker can reclaim session to new tab:

```typescript
POST /api/sessions/takeover
{
  sessionId: "uuid",
  newInstanceId: "new-tab-id"
}

// Updates active_instance_id
// Resets last_seen_at
```

---

## 7. Security Considerations

### HTTPS Requirement

**Critical:** Production MUST use HTTPS.

Headers transmitted in plaintext:
- `X-Worker-Code`
- `X-Admin-Password`

Without HTTPS, these are exposed to network sniffing.

### Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...  # Public
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # Secret - server only
ADMIN_PASSWORD=<strong-password>      # Secret
```

**Never expose service role key to clients.**

### Rate Limiting

Not implemented by default. Recommended for production:

Priority endpoints:
1. `POST /api/admin/auth/login` - Brute force prevention
2. `POST /api/sessions` - Abuse prevention
3. `POST /api/reports` - Spam prevention

Implementation options:
- Vercel Edge Middleware with Upstash
- Supabase Edge Functions
- API Gateway (Cloudflare, AWS)

### Input Validation

All inputs validated server-side:
- UUID format validation
- Enum value validation
- Required field checks
- JSONB structure validation (checklists, reasons)

### SQL Injection

Protected by:
- Supabase client parameterized queries
- TypeScript type checking
- Server-side validation

### XSS Prevention

Protected by:
- React automatic escaping
- No dangerouslySetInnerHTML usage
- Content-Security-Policy headers (recommended)

---

## 8. Implementation Files

### Authentication

| File | Purpose |
|------|---------|
| `lib/auth/permissions.ts` | Worker/admin validation |
| `lib/auth/admin-session.ts` | Session cookie management |
| `lib/auth/request-context.ts` | Extract auth from request |
| `lib/api/auth-helpers.ts` | Client-side code storage |

### API Routes

| File | Purpose |
|------|---------|
| `app/api/workers/login/route.ts` | Worker login |
| `app/api/admin/auth/login/route.ts` | Admin login |
| `app/api/admin/auth/session/route.ts` | Session validation |
| `app/api/admin/auth/change-password/route.ts` | Password change |

### Supabase

| File | Purpose |
|------|---------|
| `lib/supabase/client.ts` | Client creation |
| `supabase/migrations/20251215112227_enable_rls_policies.sql` | RLS setup |

### Hooks

| File | Purpose |
|------|---------|
| `hooks/useAdminGuard.ts` | Admin route protection |

---

## Authentication Flow Diagrams

### Worker Authentication
```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ Worker │────►│ Login  │────►│  API   │────►│Supabase│
│        │     │  Page  │     │ Route  │     │        │
└────────┘     └────────┘     └────────┘     └────────┘
     │              │              │              │
     │  Enter code  │              │              │
     │─────────────►│              │              │
     │              │ POST /login  │              │
     │              │─────────────►│              │
     │              │              │ Validate     │
     │              │              │─────────────►│
     │              │              │◄─────────────│
     │              │ Worker data  │              │
     │              │◄─────────────│              │
     │ Store code   │              │              │
     │◄─────────────│              │              │
```

### Admin Authentication
```
┌───────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ Admin │────►│ Login  │────►│  API   │────►│ Env    │
│       │     │ Dialog │     │ Route  │     │ Check  │
└───────┘     └────────┘     └────────┘     └────────┘
     │              │              │              │
     │Enter password│              │              │
     │─────────────►│              │              │
     │              │ POST /login  │              │
     │              │─────────────►│              │
     │              │              │ Compare      │
     │              │              │─────────────►│
     │              │              │◄─────────────│
     │              │ Set cookie   │              │
     │              │◄─────────────│              │
     │ Redirect     │              │              │
     │◄─────────────│              │              │
```
