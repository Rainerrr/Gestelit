# Production Lines & WIP Tracking

> Production line system with Work-In-Progress (WIP) balance tracking
> Feature added: January 2026
> Last updated: January 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Concepts](#2-concepts)
3. [Database Schema](#3-database-schema)
4. [WIP Balance Model](#4-wip-balance-model)
5. [Worker Flow](#5-worker-flow)
6. [Quantity Updates](#6-quantity-updates)
7. [Corrections](#7-corrections)
8. [Admin Management](#8-admin-management)
9. [Live Progress Tracking](#9-live-progress-tracking)
10. [API Reference](#10-api-reference)

---

## 1. Overview

The production line system enables:
- **Multi-station workflows**: Define ordered station sequences
- **Job items**: Assign production requirements to stations or lines
- **WIP tracking**: Track work-in-progress between stations
- **Completion tracking**: Only terminal station output counts as complete
- **Corrections**: Safe decrease with LIFO reversal

### Key Benefits
- Real-time visibility into production progress
- Bottleneck detection via WIP accumulation
- Scrap tracking with upstream consumption
- Safe corrections that maintain data integrity

---

## 2. Concepts

### Production Line
An ordered sequence of stations (template).

```
Production Line: "Book Binding"
  Position 1: Printing Station
  Position 2: Folding Station
  Position 3: Binding Station (terminal)
```

### Job Item
A distinct production requirement within a job.

**Two kinds:**
- `station`: Single station produces the item
- `line`: Multiple stations in sequence, only terminal counts

### WIP (Work-In-Progress)
GOOD inventory waiting between stations.

```
[Station 1] ---> [WIP Balance: 100] ---> [Station 2] ---> [WIP Balance: 50] ---> [Station 3]
                                                                                 (terminal)
```

### Terminal Station
Last station in a line. Only its GOOD output increments job completion.

### Pulled vs Originated
- **Pulled**: Consumed from upstream WIP balance
- **Originated**: Created at station when upstream insufficient

---

## 3. Database Schema

### production_lines
```sql
CREATE TABLE production_lines (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NULL,
  is_active BOOLEAN DEFAULT true
);
```

### production_line_stations
```sql
CREATE TABLE production_line_stations (
  id UUID PRIMARY KEY,
  production_line_id UUID REFERENCES production_lines(id),
  station_id UUID REFERENCES stations(id),
  position INTEGER NOT NULL CHECK (position > 0),

  -- Each station can only be in ONE line
  UNIQUE (station_id)
);
```

### job_items
```sql
CREATE TABLE job_items (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  kind TEXT NOT NULL CHECK (kind IN ('station', 'line')),
  station_id UUID NULL,          -- For kind='station'
  production_line_id UUID NULL,  -- For kind='line'
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0)
);
```

### job_item_stations
Frozen snapshot of production steps.

```sql
CREATE TABLE job_item_stations (
  id UUID PRIMARY KEY,
  job_item_id UUID REFERENCES job_items(id),
  station_id UUID REFERENCES stations(id),
  position INTEGER NOT NULL,
  is_terminal BOOLEAN DEFAULT false
);
```

### job_item_progress
```sql
CREATE TABLE job_item_progress (
  job_item_id UUID PRIMARY KEY REFERENCES job_items(id),
  completed_good INTEGER DEFAULT 0 CHECK (completed_good >= 0)
);
```

### wip_balances
```sql
CREATE TABLE wip_balances (
  id UUID PRIMARY KEY,
  job_item_id UUID REFERENCES job_items(id),
  job_item_station_id UUID REFERENCES job_item_stations(id),
  good_available INTEGER DEFAULT 0 CHECK (good_available >= 0)
);
```

### wip_consumptions
```sql
CREATE TABLE wip_consumptions (
  id UUID PRIMARY KEY,
  job_item_id UUID REFERENCES job_items(id),
  consuming_session_id UUID REFERENCES sessions(id),
  from_job_item_station_id UUID REFERENCES job_item_stations(id),
  good_used INTEGER NOT NULL CHECK (good_used > 0),
  is_scrap BOOLEAN DEFAULT false
);
```

---

## 4. WIP Balance Model

### Balance-Based Tracking
Each step has a single balance representing available GOOD units:

```
wip_balances(job_item_id, job_item_station_id) = good_available

Step 1 balance: 0   (no upstream)
Step 2 balance: 100 (waiting for step 2)
Step 3 balance: 50  (waiting for terminal)
```

### Consumption Ledger
Each session records what it pulled from upstream:

```
wip_consumptions:
  session_id=ABC, from_step=Step1, good_used=50, is_scrap=false
  session_id=ABC, from_step=Step1, good_used=30, is_scrap=true
```

### Derived Values
```
pulled_good(session) = SUM(wip_consumptions.good_used WHERE is_scrap=false)
originated_good(session) = session.total_good - pulled_good
pulled_scrap(session) = SUM(wip_consumptions.good_used WHERE is_scrap=true)
originated_scrap(session) = session.total_scrap - pulled_scrap
```

---

## 5. Worker Flow

### Station Selection with Production Lines

```typescript
// Worker enters job number
// System fetches job items for this job

POST /api/jobs/[jobId]/station-selection
{
  workerId: "uuid"
}

// Response includes:
{
  jobItems: [
    {
      id: "uuid",
      kind: "line",
      planned_quantity: 1000,
      completed_good: 500
    }
  ],
  stationOptions: [
    {
      jobItemId: "uuid",
      jobItemStationId: "uuid",
      stationId: "uuid",
      stationName: "Printing",
      position: 1,
      isTerminal: false,
      wipAvailable: 0,           // No upstream for step 1
      isOccupied: false,
      isAssignedToWorker: true
    },
    {
      jobItemId: "uuid",
      jobItemStationId: "uuid",
      stationId: "uuid",
      stationName: "Folding",
      position: 2,
      isTerminal: false,
      wipAvailable: 100,         // WIP from step 1
      isOccupied: false,
      isAssignedToWorker: true
    }
  ]
}
```

### Session Creation
```typescript
POST /api/sessions
{
  workerId: "uuid",
  stationId: "uuid",
  jobId: "uuid",
  jobItemId: "uuid",            // Links to job item
  jobItemStationId: "uuid",     // Links to specific step
  instanceId: "unique-tab-id"
}
```

### Session Fields
```sql
sessions.job_item_id           -- FK to job_items
sessions.job_item_station_id   -- FK to job_item_stations (current step)
```

---

## 6. Quantity Updates

### RPC Function
```sql
update_session_quantities_atomic_v2(
  p_session_id UUID,
  p_total_good INTEGER,
  p_total_scrap INTEGER
) RETURNS session_update_result
```

### GOOD Increase Path

```typescript
// Session at Step 2 reports +10 good
delta_good = 10

1. Find upstream step (Step 1)
2. Check upstream WIP balance: good_available = 100
3. Pull from upstream: pull_amount = min(10, 100) = 10
4. Decrement upstream: good_available = 90
5. Record consumption: wip_consumptions(session, step1, 10, is_scrap=false)
6. Increment current step balance: good_available += 10
7. If terminal: completed_good += 10
8. Update session: total_good = new_value
```

### GOOD Origination

```typescript
// Session at Step 2 reports +100 good
// Upstream only has 30 available
delta_good = 100

1. Pull from upstream: pull_amount = 30
2. Originated: 100 - 30 = 70
3. Decrement upstream: good_available = 0
4. Record consumption: wip_consumptions(session, step1, 30, is_scrap=false)
5. Increment current step balance: good_available += 100
```

### SCRAP Increase Path

```typescript
// Session reports +5 scrap
delta_scrap = 5

1. Find upstream step (if position > 1)
2. Pull from upstream if available
3. Record consumption with is_scrap=true
4. DO NOT add to current step balance (scrap is destroyed)
5. Update session: total_scrap = new_value
```

---

## 7. Corrections

### GOOD Decrease

```typescript
// Session wants to decrease good by 20
delta_good = -20
reduce = 20

// Step 1: Check downstream protection
current_balance = wip_balances.good_available
if current_balance < reduce:
  ERROR: WIP_DOWNSTREAM_CONSUMED
  // Cannot undo what downstream already consumed

// Step 2: Reduce current balance
wip_balances.good_available -= 20
if is_terminal:
  job_item_progress.completed_good -= 20

// Step 3: Determine originated vs pulled
pulled_total = SUM(wip_consumptions.good_used WHERE is_scrap=false)
originated_total = session.total_good - pulled_total

// Step 4: Reduce originated first (no upstream change)
originated_reduce = min(20, originated_total)

// Step 5: Return pulled via LIFO
pulled_reduce = 20 - originated_reduce
FOR each consumption ORDER BY created_at DESC:
  return_amount = min(consumption.good_used, pulled_reduce)
  upstream.good_available += return_amount
  consumption.good_used -= return_amount (or delete if 0)
  pulled_reduce -= return_amount
  if pulled_reduce == 0: break
```

### SCRAP Decrease

Same logic as GOOD decrease:
1. No balance check (scrap doesn't add to balance)
2. Calculate originated vs pulled scrap
3. Reduce originated first
4. Return pulled via LIFO

---

## 8. Admin Management

### Create Production Line

```typescript
POST /api/admin/production-lines
{
  name: "Book Binding Line",
  code: "BBL-001",
  stationIds: ["station1-uuid", "station2-uuid", "station3-uuid"]
}

// Creates:
// - production_lines row
// - production_line_stations rows with positions 1, 2, 3
```

### Reorder Stations

```typescript
PUT /api/admin/production-lines/[id]/stations
{
  stationIds: ["station2-uuid", "station1-uuid", "station3-uuid"]
}

// Atomically updates positions
```

### Create Job Item

```typescript
POST /api/admin/jobs/[jobId]/items
{
  kind: "line",
  productionLineId: "line-uuid",
  plannedQuantity: 1000
}

// Creates:
// - job_items row
// - job_item_stations (frozen snapshot from production_line_stations)
// - wip_balances rows for each step
// - job_item_progress row
```

### View Available Stations

```typescript
GET /api/admin/production-lines/available-stations

// Returns stations not assigned to any production line
{
  stations: [
    { id: "uuid", name: "Unassigned Station", code: "US-01" }
  ]
}
```

---

## 9. Live Progress Tracking

### Job Progress API

```typescript
GET /api/admin/dashboard/job-progress

{
  jobs: [
    {
      id: "uuid",
      job_number: "JOB-123",
      items: [
        {
          id: "uuid",
          kind: "line",
          planned_quantity: 1000,
          completed_good: 500,
          stations: [
            {
              station_id: "uuid",
              station_name: "Printing",
              position: 1,
              is_terminal: false,
              wip_available: 100,
              active_sessions: 1
            },
            {
              station_id: "uuid",
              station_name: "Folding",
              position: 2,
              is_terminal: false,
              wip_available: 50,
              active_sessions: 0
            },
            {
              station_id: "uuid",
              station_name: "Binding",
              position: 3,
              is_terminal: true,
              wip_available: 0,
              active_sessions: 1
            }
          ]
        }
      ]
    }
  ]
}
```

### Bottleneck Detection

```sql
-- Find steps with highest WIP (bottlenecks)
SELECT
  jis.station_id,
  s.name as station_name,
  wb.good_available as wip
FROM wip_balances wb
JOIN job_item_stations jis ON jis.id = wb.job_item_station_id
JOIN stations s ON s.id = jis.station_id
WHERE wb.good_available > 0
ORDER BY wb.good_available DESC;
```

### WIP Accounting View

```sql
SELECT * FROM v_session_wip_accounting;

-- Returns:
session_id | job_item_id | job_item_station_id |
total_good | pulled_good | originated_good |
total_scrap | pulled_scrap | originated_scrap
```

---

## 10. API Reference

### Worker APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/jobs/[jobId]/allowed-stations` | GET | Stations for job |
| `/api/jobs/[jobId]/station-selection` | POST | Pipeline options |
| `/api/sessions` | POST | Create session with WIP |
| `/api/sessions/quantities` | PATCH | Update with WIP |
| `/api/sessions/pipeline/stream` | GET | Real-time pipeline |

### Admin APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/production-lines` | GET/POST | List/create lines |
| `/api/admin/production-lines/[id]` | GET/PUT/DELETE | Line CRUD |
| `/api/admin/production-lines/[id]/stations` | PUT | Reorder |
| `/api/admin/production-lines/available-stations` | GET | Unassigned |
| `/api/admin/jobs/[id]/items` | GET/POST | Job items |
| `/api/admin/jobs/[id]/items/[itemId]` | PUT/DELETE | Item CRUD |
| `/api/admin/dashboard/job-progress` | GET | Live progress |

### Data Layer

| File | Purpose |
|------|---------|
| `lib/data/production-lines.ts` | Line CRUD |
| `lib/data/job-items.ts` | Item CRUD, pipeline |
| `lib/data/sessions.ts` | Session with WIP |

### RPC Functions

| Function | Purpose |
|----------|---------|
| `rebuild_job_item_stations(job_item_id)` | Expand steps |
| `update_session_quantities_atomic_v2(...)` | WIP updates |

---

## Key Business Rules

1. **Station belongs to ONE line**: A station cannot be in multiple lines
2. **Frozen snapshots**: Job item stations are fixed at creation time
3. **Terminal-only completion**: Only terminal station output counts
4. **GOOD-only WIP**: Scrap doesn't flow downstream
5. **LIFO corrections**: Pulled units return in reverse order
6. **Downstream protection**: Cannot decrease below consumed amount
7. **Origination allowed**: Can produce without upstream WIP
