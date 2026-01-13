# API Reference

> Complete API endpoint documentation for Gestelit Work Monitor
> All routes are in `app/api/`
> Last updated: January 2026

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Worker APIs](#2-worker-apis)
3. [Session APIs](#3-session-apis)
4. [Status APIs](#4-status-apis)
5. [Report APIs](#5-report-apis)
6. [Admin Dashboard APIs](#6-admin-dashboard-apis)
7. [Admin Management APIs](#7-admin-management-apis)
8. [Production Line APIs](#8-production-line-apis)
9. [Cron APIs](#9-cron-apis)
10. [Stream (SSE) APIs](#10-stream-sse-apis)

---

## Authentication Headers

### Worker Authentication
```
X-Worker-Code: <worker_code>
```
- Required for all worker-facing endpoints
- Validated via `lib/auth/permissions.ts`

### Admin Authentication
Option 1 - Session cookie (preferred):
```
Cookie: admin_session=<session_token>
```
- Set automatically after login
- 15-minute TTL, auto-refreshed

Option 2 - Header:
```
X-Admin-Password: <admin_password>
```

---

## 1. Authentication

### POST /api/workers/login
Authenticate worker by code.

**Request:**
```json
{
  "workerCode": "string"
}
```

**Response (200):**
```json
{
  "worker": {
    "id": "uuid",
    "worker_code": "string",
    "full_name": "string",
    "language": "he|ru|auto",
    "is_active": true
  }
}
```

**Errors:**
- `404`: Worker not found or inactive

---

### POST /api/admin/auth/login
Admin login, sets session cookie.

**Request:**
```json
{
  "password": "string"
}
```

**Response (200):**
```json
{
  "success": true
}
```
Sets `admin_session` HttpOnly cookie.

**Errors:**
- `401`: Invalid password

---

### GET /api/admin/auth/session
Validate admin session.

**Response (200):**
```json
{
  "valid": true
}
```

**Errors:**
- `401`: No valid session

---

### POST /api/admin/auth/change-password
Change admin password.

**Request:**
```json
{
  "currentPassword": "string",
  "newPassword": "string"
}
```

**Response (200):**
```json
{
  "success": true
}
```

---

## 2. Worker APIs

### GET /api/workers/active-session
Get worker's recoverable session within grace period.

**Headers:** `X-Worker-Code`

**Response (200):**
```json
{
  "session": {
    "id": "uuid",
    "status": "active",
    "started_at": "timestamp",
    "total_good": 0,
    "total_scrap": 0
  },
  "station": { "id": "uuid", "name": "string" },
  "job": { "id": "uuid", "job_number": "string" },
  "graceExpiresAt": "timestamp"
}
```

**Response (200, no session):**
```json
{
  "session": null
}
```

---

### GET /api/stations
Get stations assigned to worker.

**Headers:** `X-Worker-Code`

**Response (200):**
```json
{
  "stations": [
    {
      "id": "uuid",
      "code": "string",
      "name": "string",
      "station_type": "string",
      "is_active": true
    }
  ]
}
```

---

### GET /api/stations/with-occupancy
Get stations with active session info.

**Headers:** `X-Worker-Code`

**Query Parameters:**
- `workerId` (required): Worker UUID

**Response (200):**
```json
{
  "stations": [
    {
      "id": "uuid",
      "code": "string",
      "name": "string",
      "occupancy": {
        "isOccupied": true,
        "occupiedByWorkerId": "uuid",
        "occupiedByWorkerName": "string",
        "isInGracePeriod": false,
        "graceExpiresAt": "timestamp|null"
      }
    }
  ]
}
```

---

### GET /api/statuses
Get status definitions for station.

**Headers:** `X-Worker-Code`

**Query Parameters:**
- `stationId` (required): Station UUID

**Response (200):**
```json
{
  "statuses": [
    {
      "id": "uuid",
      "label_he": "string",
      "label_ru": "string",
      "color_hex": "#hex",
      "machine_state": "production|setup|stoppage",
      "report_type": "none|malfunction|general"
    }
  ]
}
```

---

### GET /api/checklists
Get checklists for station.

**Query Parameters:**
- `stationId` (required): Station UUID
- `kind` (required): `start` or `end`

**Response (200):**
```json
{
  "checklist": [
    {
      "id": "string",
      "label_he": "string",
      "label_ru": "string",
      "order_index": 0,
      "is_required": true
    }
  ]
}
```

---

### POST /api/checklists/responses
Submit checklist responses.

**Headers:** `X-Worker-Code`

**Request:**
```json
{
  "sessionId": "uuid",
  "stationId": "uuid",
  "kind": "start|end",
  "responses": [
    { "itemId": "string", "checked": true }
  ]
}
```

**Response (200):**
```json
{
  "success": true
}
```

---

### GET /api/reasons
Get station malfunction reasons.

**Query Parameters:**
- `stationId` (required): Station UUID

**Response (200):**
```json
{
  "reasons": [
    {
      "id": "string",
      "label_he": "string",
      "label_ru": "string",
      "is_active": true
    }
  ]
}
```

---

## 3. Session APIs

### POST /api/sessions
Create new session (atomic, closes existing).

**Headers:** `X-Worker-Code`

**Request:**
```json
{
  "workerId": "uuid",
  "stationId": "uuid",
  "jobId": "uuid",
  "jobItemId": "uuid|null",
  "jobItemStationId": "uuid|null",
  "instanceId": "string"
}
```

**Response (201):**
```json
{
  "session": {
    "id": "uuid",
    "status": "active",
    "current_status_id": "uuid",
    "started_at": "timestamp"
  }
}
```

---

### POST /api/sessions/heartbeat
Keep session alive.

**Headers:** `X-Worker-Code`

**Request:**
```json
{
  "sessionId": "uuid",
  "instanceId": "string"
}
```

**Response (200):**
```json
{
  "success": true
}
```

**Errors:**
- `409 INSTANCE_MISMATCH`: Session running in different tab

---

### POST /api/sessions/complete
End session successfully.

**Headers:** `X-Worker-Code`

**Request:**
```json
{
  "sessionId": "uuid"
}
```

**Response (200):**
```json
{
  "session": {
    "id": "uuid",
    "status": "completed",
    "ended_at": "timestamp"
  }
}
```

---

### POST /api/sessions/abandon
Abandon session (worker choice or expired).

**Headers:** `X-Worker-Code`

**Request:**
```json
{
  "sessionId": "uuid",
  "reason": "worker-abandon|expired"
}
```

**Response (200):**
```json
{
  "success": true
}
```

---

### POST /api/sessions/takeover
Reclaim session to new browser instance.

**Headers:** `X-Worker-Code`

**Request:**
```json
{
  "sessionId": "uuid",
  "newInstanceId": "string"
}
```

**Response (200):**
```json
{
  "session": { ... }
}
```

---

### PATCH /api/sessions/quantities
Update production quantities (atomic with WIP).

**Headers:** `X-Worker-Code`

**Request:**
```json
{
  "sessionId": "uuid",
  "totalGood": 100,
  "totalScrap": 5
}
```

**Response (200):**
```json
{
  "success": true,
  "totalGood": 100,
  "totalScrap": 5
}
```

**Errors:**
- `409 WIP_DOWNSTREAM_CONSUMED`: Cannot decrease, downstream already consumed

---

### GET /api/sessions/quantities
Get current session quantities.

**Query Parameters:**
- `sessionId` (required): Session UUID

**Response (200):**
```json
{
  "totalGood": 100,
  "totalScrap": 5
}
```

---

### POST /api/sessions/pipeline
Get pipeline options for session.

**Request:**
```json
{
  "jobId": "uuid",
  "workerId": "uuid"
}
```

**Response (200):**
```json
{
  "jobItems": [...],
  "stationOptions": [...]
}
```

---

## 4. Status APIs

### POST /api/status-events
Create status event (atomic).

**Headers:** `X-Worker-Code`

**Request:**
```json
{
  "sessionId": "uuid",
  "statusDefinitionId": "uuid",
  "stationReasonId": "string|null",
  "note": "string|null",
  "imageUrl": "string|null"
}
```

**Response (201):**
```json
{
  "statusEvent": {
    "id": "uuid",
    "status_definition_id": "uuid",
    "started_at": "timestamp"
  }
}
```

---

### POST /api/status-events/with-report
Create status event and linked report atomically.

**Headers:** `X-Worker-Code`

**Request:**
```json
{
  "sessionId": "uuid",
  "statusDefinitionId": "uuid",
  "stationReasonId": "string|null",
  "note": "string|null",
  "imageUrl": "string|null",
  "report": {
    "type": "malfunction|general|scrap",
    "description": "string",
    "imageUrl": "string|null"
  }
}
```

**Response (201):**
```json
{
  "statusEvent": { ... },
  "report": { ... }
}
```

---

## 5. Report APIs

### POST /api/reports
Create report.

**Headers:** `X-Worker-Code`

**Request:**
```json
{
  "type": "malfunction|general|scrap",
  "stationId": "uuid",
  "sessionId": "uuid|null",
  "statusEventId": "uuid|null",
  "stationReasonId": "string|null",
  "reportReasonId": "uuid|null",
  "description": "string",
  "imageUrl": "string|null"
}
```

**Response (201):**
```json
{
  "report": {
    "id": "uuid",
    "type": "malfunction",
    "status": "open"
  }
}
```

---

### GET /api/reports/reasons
Get active report reasons.

**Response (200):**
```json
{
  "reasons": [
    {
      "id": "uuid",
      "label_he": "string",
      "label_ru": "string"
    }
  ]
}
```

---

## 6. Admin Dashboard APIs

### GET /api/admin/dashboard/active-sessions
Get all active sessions.

**Response (200):**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "worker": { "id": "uuid", "full_name": "string" },
      "station": { "id": "uuid", "name": "string" },
      "job": { "id": "uuid", "job_number": "string" },
      "currentStatus": { "label_he": "string", "color_hex": "#hex" },
      "started_at": "timestamp",
      "last_seen_at": "timestamp",
      "total_good": 0,
      "total_scrap": 0
    }
  ]
}
```

---

### GET /api/admin/dashboard/recent-sessions
Get recently completed sessions.

**Query Parameters:**
- `limit` (optional): Number of sessions (default: 10)
- `startDate` (optional): Filter start
- `endDate` (optional): Filter end

**Response (200):**
```json
{
  "sessions": [...]
}
```

---

### GET /api/admin/dashboard/status-events
Get status events for sessions.

**Query Parameters:**
- `sessionIds` (required): Comma-separated UUIDs

**Response (200):**
```json
{
  "statusEvents": [
    {
      "id": "uuid",
      "session_id": "uuid",
      "status_definition": { ... },
      "started_at": "timestamp",
      "ended_at": "timestamp|null"
    }
  ]
}
```

---

### GET /api/admin/dashboard/monthly-throughput
Get monthly production statistics.

**Response (200):**
```json
{
  "throughput": [
    {
      "month": "2026-01",
      "total_good": 1000,
      "total_scrap": 50,
      "session_count": 100
    }
  ]
}
```

---

### GET /api/admin/dashboard/session/[id]
Get session details.

**Response (200):**
```json
{
  "session": { ... },
  "statusEvents": [...],
  "reports": [...]
}
```

---

### GET /api/admin/dashboard/job-progress
Get live job progress with WIP distribution.

**Response (200):**
```json
{
  "jobs": [
    {
      "id": "uuid",
      "job_number": "string",
      "items": [
        {
          "id": "uuid",
          "kind": "line",
          "planned_quantity": 1000,
          "completed_good": 500,
          "stations": [
            {
              "station_id": "uuid",
              "station_name": "string",
              "position": 1,
              "is_terminal": false,
              "wip_available": 100
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 7. Admin Management APIs

### Workers

**GET /api/admin/workers** - List all workers
**POST /api/admin/workers** - Create worker
**GET /api/admin/workers/[id]** - Get worker
**PUT /api/admin/workers/[id]** - Update worker
**DELETE /api/admin/workers/[id]** - Delete worker
**GET /api/admin/workers/[id]/active-session** - Get worker's active session

### Stations

**GET /api/admin/stations** - List all stations
**POST /api/admin/stations** - Create station
**GET /api/admin/stations/[id]** - Get station
**PUT /api/admin/stations/[id]** - Update station
**DELETE /api/admin/stations/[id]** - Delete station
**GET /api/admin/stations/[id]/active-session** - Get station's active session

### Jobs

**GET /api/admin/jobs** - List jobs with stats
**POST /api/admin/jobs** - Create job
**GET /api/admin/jobs/[id]** - Get job
**PUT /api/admin/jobs/[id]** - Update job
**DELETE /api/admin/jobs/[id]** - Delete job
**GET /api/admin/jobs/[id]/active-session** - Get job's active sessions

### Job Items

**GET /api/admin/jobs/[id]/items** - List job items
**POST /api/admin/jobs/[id]/items** - Create job item
**PUT /api/admin/jobs/[id]/items/[itemId]** - Update job item
**DELETE /api/admin/jobs/[id]/items/[itemId]** - Delete job item

### Status Definitions

**GET /api/admin/status-definitions** - List statuses
**POST /api/admin/status-definitions** - Create status
**PUT /api/admin/status-definitions/[id]** - Update status
**DELETE /api/admin/status-definitions/[id]** - Delete status
**POST /api/admin/status-definitions/purge** - Remove unused statuses

### Worker-Station Assignments

**GET /api/admin/worker-stations** - List assignments
**POST /api/admin/worker-stations** - Create assignment
**DELETE /api/admin/worker-stations** - Remove assignment

### Reports (Admin)

**GET /api/admin/reports** - List reports with filters
**PATCH /api/admin/reports/[id]** - Update report status

Query parameters for GET:
- `type`: `malfunction|general|scrap`
- `status`: Filter by status
- `stationId`: Filter by station

### Report Reasons

**GET /api/admin/reports/reasons** - List reasons
**POST /api/admin/reports/reasons** - Create reason
**PUT /api/admin/reports/reasons/[id]** - Update reason
**DELETE /api/admin/reports/reasons/[id]** - Delete reason

### Other Admin

**GET /api/admin/departments** - Get unique departments
**GET /api/admin/station-types** - Get station types
**POST /api/admin/sessions/close-all** - Force close all sessions
**DELETE /api/admin/sessions/delete** - Delete session record

---

## 8. Production Line APIs

### Production Lines

**GET /api/admin/production-lines** - List production lines

Response:
```json
{
  "productionLines": [
    {
      "id": "uuid",
      "name": "string",
      "code": "string|null",
      "is_active": true,
      "stations": [
        { "station_id": "uuid", "station_name": "string", "position": 1 }
      ]
    }
  ]
}
```

**POST /api/admin/production-lines** - Create production line

Request:
```json
{
  "name": "string",
  "code": "string|null",
  "stationIds": ["uuid", "uuid", "uuid"]
}
```

**GET /api/admin/production-lines/[id]** - Get production line
**PUT /api/admin/production-lines/[id]** - Update production line
**DELETE /api/admin/production-lines/[id]** - Delete production line

**PUT /api/admin/production-lines/[id]/stations** - Reorder stations

Request:
```json
{
  "stationIds": ["uuid", "uuid", "uuid"]
}
```

**GET /api/admin/production-lines/available-stations** - Get stations not in any line

---

### Job Station Selection (Worker)

**GET /api/jobs/[jobId]/allowed-stations** - Get stations for job

Returns only stations relevant to job's job_items/steps.

**POST /api/jobs/[jobId]/station-selection** - Get pipeline options

Request:
```json
{
  "workerId": "uuid"
}
```

Response:
```json
{
  "jobItems": [
    {
      "id": "uuid",
      "kind": "line|station",
      "planned_quantity": 1000,
      "completed_good": 500
    }
  ],
  "stationOptions": [
    {
      "jobItemId": "uuid",
      "jobItemStationId": "uuid",
      "stationId": "uuid",
      "stationName": "string",
      "position": 1,
      "isTerminal": false,
      "wipAvailable": 100,
      "isOccupied": false,
      "isAssignedToWorker": true
    }
  ]
}
```

---

### Job Validation

**POST /api/jobs/validate** - Validate job number

Request:
```json
{
  "jobNumber": "string"
}
```

Response:
```json
{
  "valid": true,
  "job": { "id": "uuid", "job_number": "string" }
}
```

Or:
```json
{
  "valid": false,
  "create": true
}
```

---

## 9. Cron APIs

### POST /api/cron/close-idle-sessions
Auto-close sessions idle > 5 minutes.

**Response (200):**
```json
{
  "closed": 5,
  "sessionIds": ["uuid", "uuid", ...]
}
```

---

## 10. Stream (SSE) APIs

### GET /api/admin/dashboard/active-sessions/stream
Real-time active sessions stream.

**Event Types:**
```
event: initial
data: {"sessions": [...]}

event: update
data: {"session": {...}}

event: insert
data: {"session": {...}}

event: delete
data: {"sessionId": "uuid"}

event: heartbeat
data: {}
```

---

### GET /api/admin/dashboard/session/[id]/stream
Real-time single session stream.

**Event Types:**
```
event: initial
data: {"session": {...}, "statusEvents": [...]}

event: session_update
data: {"session": {...}}

event: status_event
data: {"statusEvent": {...}}

event: heartbeat
data: {}
```

---

### GET /api/admin/reports/stream
Real-time reports stream.

**Query Parameters:**
- `type` (optional): Filter by report type

**Event Types:**
```
event: initial
data: {"reports": [...]}

event: insert
data: {"report": {...}}

event: update
data: {"report": {...}}

event: heartbeat
data: {}
```

---

### GET /api/sessions/pipeline/stream
Real-time pipeline options stream (for worker station selection).

**Query Parameters:**
- `jobId` (required): Job UUID
- `workerId` (required): Worker UUID

**Event Types:**
```
event: initial
data: {"jobItems": [...], "stationOptions": [...]}

event: update
data: {"stationOptions": [...]}

event: heartbeat
data: {}
```

---

## Error Response Format

All endpoints return errors in this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common error codes:
- `UNAUTHORIZED`: Missing or invalid authentication
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `INVALID_REQUEST`: Bad request body
- `INSTANCE_MISMATCH`: Session in different tab
- `WIP_DOWNSTREAM_CONSUMED`: Cannot decrease quantities
- `PROTECTED_STATUS`: Cannot modify protected status

---

## Data Layer Pattern

All API routes follow this pattern:

```typescript
// app/api/example/route.ts
import { createServiceSupabase } from '@/lib/supabase/client';
import { someDataFunction } from '@/lib/data/example';

export async function GET(request: Request) {
  const supabase = createServiceSupabase(); // Bypasses RLS

  try {
    const result = await someDataFunction(supabase, params);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: 'message' }, { status: 500 });
  }
}
```

Data functions are in `lib/data/` for reuse across routes.
