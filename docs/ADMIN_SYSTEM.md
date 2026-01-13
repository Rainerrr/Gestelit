# Admin System

> Admin dashboard, management, and reporting system
> Routes: `app/admin/`
> Last updated: January 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Dashboard](#3-dashboard)
4. [History Page](#4-history-page)
5. [Reports System](#5-reports-system)
6. [Management Pages](#6-management-pages)
7. [Real-Time Features](#7-real-time-features)
8. [Components](#8-components)

---

## 1. Overview

The admin system provides:
- Real-time session monitoring
- Historical analytics and BI
- Report management (malfunctions, general, scrap)
- Entity management (workers, stations, jobs, statuses)
- Production line configuration

### Routes

| Route | Purpose |
|-------|---------|
| `/admin` | Main dashboard |
| `/admin/history` | Historical sessions and analytics |
| `/admin/reports` | Reports landing |
| `/admin/reports/malfunctions` | Equipment issues |
| `/admin/reports/general` | General observations |
| `/admin/reports/scrap` | Scrap tracking |
| `/admin/manage` | Entity management |
| `/admin/session/[id]` | Session detail view |

---

## 2. Authentication

### Login Flow
```typescript
1. Navigate to /admin
2. If no session, show login dialog
3. POST /api/admin/auth/login { password }
4. Sets HttpOnly cookie: admin_session (15-min TTL)
5. Cookie auto-refreshed on API calls
```

### Session Validation
```typescript
// Check on page load
GET /api/admin/auth/session
Response: { valid: true } or 401

// useAdminGuard hook handles redirect
```

### Password Change
```typescript
POST /api/admin/auth/change-password
{
  currentPassword: "old",
  newPassword: "new"
}
```

---

## 3. Dashboard

**Route:** `/admin`
**Component:** `app/admin/_components/admin-dashboard.tsx`

### Features

#### Active Sessions Table
- Real-time updates via SSE stream
- Shows all currently active sessions
- Columns: Worker, Station, Job, Status, Duration, Good/Scrap
- Click row for session detail

#### KPI Cards
- Total active sessions
- Active malfunctions count
- Pending reports count
- Today's production totals

#### Active Reports Widget
- Open malfunction count (badge)
- Pending general reports count
- Quick links to report pages

#### Live Job Progress
- Jobs with active production
- WIP distribution across stations
- Completion percentage

### Data Flow
```typescript
// Initial load
GET /api/admin/dashboard/active-sessions

// Real-time updates
GET /api/admin/dashboard/active-sessions/stream (SSE)

// Report counts
GET /api/admin/reports?type=malfunction&status=open
```

---

## 4. History Page

**Route:** `/admin/history`
**Component:** `app/admin/_components/history-dashboard.tsx`

### Features

#### Date Range Picker
- Custom date range selection
- Preset options (Today, Last 7 days, Last 30 days)
- Future dates blocked

#### Filters
- By worker
- By station
- By job
- By status (completed/aborted)

#### Session Table
- Completed sessions in date range
- Sortable columns
- Click for session detail

#### BI Statistics
- Total sessions
- Total good produced
- Total scrap
- Scrap percentage
- Average session duration
- Production by station chart
- Production by worker chart

#### Charts
```typescript
// Components
- history-charts.tsx - Session distribution charts
- history-statistics.tsx - KPI summary cards
- history-filters.tsx - Filter controls
```

### API Calls
```typescript
GET /api/admin/dashboard/recent-sessions
  ?startDate=2026-01-01
  &endDate=2026-01-13
  &limit=100

GET /api/admin/dashboard/monthly-throughput
```

---

## 5. Reports System

### Report Types

| Type | Status Flow | Purpose |
|------|-------------|---------|
| `malfunction` | open → known → solved | Equipment issues |
| `general` | new → approved | Observations/notes |
| `scrap` | new → approved | Scrap tracking |

### Malfunction Reports

**Route:** `/admin/reports/malfunctions`

State machine:
```
open ──────► known ──────► solved
  │                          ▲
  └──────────────────────────┘
        (direct fix)

solved ──► open (reopen)
```

UI Features:
- Grouped by station
- Status badges with colors
- State transition buttons
- Admin notes field
- Linked status event duration

### General Reports

**Route:** `/admin/reports/general`

Simple approval flow:
```
new ──────► approved
```

UI Features:
- List view
- Reason categorization
- Approve button
- Description and images

### Scrap Reports

**Route:** `/admin/reports/scrap`

Same as general:
```
new ──────► approved
```

UI Features:
- Grouped by station
- Session quantities display
- Linked session info

### API Endpoints
```typescript
// List reports
GET /api/admin/reports?type=malfunction&status=open

// Update status
PATCH /api/admin/reports/[id]
{
  status: "known",
  adminNotes: "Investigating"
}

// Real-time stream
GET /api/admin/reports/stream?type=malfunction
```

---

## 6. Management Pages

**Route:** `/admin/manage`

### Workers Management

CRUD operations for workers:
- Create/edit/delete workers
- Assign worker code
- Set department
- Set language preference
- Toggle active status
- Station assignments

```typescript
// API
GET /api/admin/workers
POST /api/admin/workers
PUT /api/admin/workers/[id]
DELETE /api/admin/workers/[id]
```

### Stations Management

CRUD operations for stations:
- Create/edit/delete stations
- Set station code
- Set station type
- Configure checklists (start/end)
- Configure station-specific reasons
- Toggle active status

```typescript
// API
GET /api/admin/stations
POST /api/admin/stations
PUT /api/admin/stations/[id]
DELETE /api/admin/stations/[id]
```

### Jobs Management

CRUD operations for jobs:
- Create/edit jobs
- View job statistics
- Manage job items (production line)

```typescript
// API
GET /api/admin/jobs  // Includes stats
POST /api/admin/jobs
PUT /api/admin/jobs/[id]

// Job items
GET /api/admin/jobs/[id]/items
POST /api/admin/jobs/[id]/items
PUT /api/admin/jobs/[id]/items/[itemId]
DELETE /api/admin/jobs/[id]/items/[itemId]
```

### Status Definitions

CRUD operations for statuses:
- Create custom statuses
- Set color (15 palette options)
- Set machine state
- Configure report type trigger
- Protected statuses cannot be modified

```typescript
// API
GET /api/admin/status-definitions
POST /api/admin/status-definitions
PUT /api/admin/status-definitions/[id]
DELETE /api/admin/status-definitions/[id]
POST /api/admin/status-definitions/purge  // Remove unused
```

### Production Lines

CRUD operations for production lines:
- Create line with ordered stations
- Reorder station sequence
- View stations in line

```typescript
// API
GET /api/admin/production-lines
POST /api/admin/production-lines
PUT /api/admin/production-lines/[id]
DELETE /api/admin/production-lines/[id]
PUT /api/admin/production-lines/[id]/stations
GET /api/admin/production-lines/available-stations
```

### Worker-Station Assignments

Manage which workers can access which stations:
```typescript
// API
GET /api/admin/worker-stations
POST /api/admin/worker-stations
DELETE /api/admin/worker-stations
```

---

## 7. Real-Time Features

### SSE Streams

Active sessions stream:
```typescript
// Connection
const eventSource = new EventSource('/api/admin/dashboard/active-sessions/stream');

eventSource.addEventListener('initial', (e) => {
  const { sessions } = JSON.parse(e.data);
  // Set initial data
});

eventSource.addEventListener('update', (e) => {
  const { session } = JSON.parse(e.data);
  // Update session in state
});

eventSource.addEventListener('insert', (e) => {
  const { session } = JSON.parse(e.data);
  // Add new session
});

eventSource.addEventListener('delete', (e) => {
  const { sessionId } = JSON.parse(e.data);
  // Remove session
});

eventSource.addEventListener('heartbeat', () => {
  // Keep connection alive
});
```

Reports stream:
```typescript
const eventSource = new EventSource('/api/admin/reports/stream?type=malfunction');

// Same event pattern as above
```

### Polling Fallback
If SSE unavailable:
```typescript
// Poll every 5 seconds
setInterval(async () => {
  const data = await fetch('/api/admin/dashboard/active-sessions');
  // Update state
}, 5000);
```

---

## 8. Components

### Dashboard Components

| Component | File | Purpose |
|-----------|------|---------|
| AdminDashboard | `admin-dashboard.tsx` | Main container |
| ActiveSessionsTable | `active-sessions-table.tsx` | Live sessions |
| RecentSessionsTable | `recent-sessions-table.tsx` | Completed sessions |
| ActiveReportsWidget | `active-reports-widget.tsx` | Report badges |
| LiveJobProgress | `live-job-progress.tsx` | WIP tracking |
| KpiCards | `kpi-cards.tsx` | Statistics |
| ThroughputChart | `throughput-chart.tsx` | Production chart |
| StatusCharts | `status-charts.tsx` | Status distribution |

### Session Detail Components

| Component | File | Purpose |
|-----------|------|---------|
| SessionTimeline | `session-timeline.tsx` | Status event timeline |
| VisSessionTimeline | `vis-session-timeline.tsx` | Visual timeline |

### History Components

| Component | File | Purpose |
|-----------|------|---------|
| HistoryDashboard | `history-dashboard.tsx` | Container |
| HistoryFilters | `history-filters.tsx` | Filter controls |
| HistoryCharts | `history-charts.tsx` | Analytics charts |
| HistoryStatistics | `history-statistics.tsx` | BI summary |

### Layout Components

| Component | File | Purpose |
|-----------|------|---------|
| AdminLayout | `admin-layout.tsx` | Page structure |
| AdminPageHeader | `admin-page-header.tsx` | Navigation |
| ChangePasswordDialog | `change-password-dialog.tsx` | Password change |

---

## Key Files

### Pages
```
app/admin/
  page.tsx                          # Dashboard
  history/page.tsx                  # History
  manage/page.tsx                   # Management
  reports/page.tsx                  # Reports landing
  reports/malfunctions/page.tsx     # Malfunction reports
  reports/general/page.tsx          # General reports
  reports/scrap/page.tsx            # Scrap reports
  session/[id]/page.tsx             # Session detail
```

### Components
```
app/admin/_components/
  admin-dashboard.tsx
  admin-layout.tsx
  admin-page-header.tsx
  active-sessions-table.tsx
  active-reports-widget.tsx
  recent-sessions-table.tsx
  history-dashboard.tsx
  history-charts.tsx
  history-filters.tsx
  history-statistics.tsx
  live-job-progress.tsx
  kpi-cards.tsx
  session-timeline.tsx
  vis-session-timeline.tsx
  status-charts.tsx
  throughput-chart.tsx
  change-password-dialog.tsx
  status-dictionary.ts
```

### Data Layer
```
lib/data/
  admin-dashboard.ts    # Dashboard queries
  admin-management.ts   # CRUD operations
  reports.ts            # Report queries
  production-lines.ts   # Line management
```

### Contexts
```
contexts/
  AdminSessionsContext.tsx   # Admin session state
```

### Hooks
```
hooks/
  useAdminGuard.ts          # Auth guard
  useSessionTimeline.ts     # Timeline data
```
