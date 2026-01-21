# Phase 2: Job Selection on Production Entry

**Status:** Completed
**Completed:** 2026-01-13

---

## Overview

Phase 2 implements the two-step job selection flow when workers enter production status. When a worker clicks on a production status without having an active job item, they are prompted to select a Job and then a Job Item before production can begin.

---

## Files Created

| File | Purpose |
|------|---------|
| `app/api/stations/[stationId]/available-jobs/route.ts` | API endpoint to fetch jobs with job items for a station |
| `app/api/stations/[stationId]/jobs/[jobId]/job-items/route.ts` | API endpoint to fetch job items for a job at a station |
| `app/api/sessions/bind-job-item/route.ts` | API endpoint to bind a job item to an existing session |
| `components/work/job-selection-dialog.tsx` | Two-step job selection dialog component |

---

## Files Modified

| File | Changes |
|------|---------|
| `lib/data/sessions.ts` | Added `bindJobItemToSession()` function |
| `lib/data/job-items.ts` | Fixed type issue in `getAvailableJobsForStation()` |
| `lib/api/client.ts` | Added `AvailableJob`, `AvailableJobItem` types and client API functions |
| `app/(worker)/work/page.tsx` | Integrated job selection dialog, removed job requirement from route guards |

---

## API Endpoints

### 1. `GET /api/stations/[stationId]/available-jobs`

Returns jobs that have active job items for this station.

**Response:**
```typescript
{
  jobs: Array<{
    id: string;
    jobNumber: string;
    clientName: string | null;
    description: string | null;
    jobItemCount: number;
  }>
}
```

### 2. `GET /api/stations/[stationId]/jobs/[jobId]/job-items`

Returns job items for a specific job at a specific station.

**Response:**
```typescript
{
  jobItems: Array<{
    id: string;
    jobId: string;
    name: string;
    kind: "station" | "line";
    plannedQuantity: number;
    completedGood: number;
    remaining: number;
    jobItemStationId: string;
  }>
}
```

### 3. `POST /api/sessions/bind-job-item`

Binds a job item to an existing session.

**Request Body:**
```typescript
{
  sessionId: string;
  jobId: string;
  jobItemId: string;
  jobItemStationId: string;
}
```

**Response:**
```typescript
{
  session: Session;
}
```

---

## Client API Functions

Added to `lib/api/client.ts`:

```typescript
// Types
export type AvailableJob = {
  id: string;
  jobNumber: string;
  clientName: string | null;
  description: string | null;
  jobItemCount: number;
};

export type AvailableJobItem = {
  id: string;
  jobId: string;
  name: string;
  kind: JobItemKind;
  plannedQuantity: number;
  completedGood: number;
  remaining: number;
  jobItemStationId: string;
};

// Functions
fetchAvailableJobsForStationApi(stationId: string): Promise<AvailableJob[]>
fetchJobItemsForStationJobApi(stationId: string, jobId: string): Promise<AvailableJobItem[]>
bindJobItemToSessionApi(sessionId, jobId, jobItemId, jobItemStationId): Promise<Session>
```

---

## Work Page Integration

### Route Guard Changes

The work page no longer requires a job to be present. Updated guards:
- `if (!worker)` → redirect to `/login`
- `if (!station)` → redirect to `/station`
- `if (!sessionId)` → redirect to `/station`
- Job is no longer required upfront

### Status Change Flow

When worker clicks a production status:

1. Check if `statusDef.machine_state === "production"`
2. Check if `activeJobItem` is null
3. If both true, open `JobSelectionDialog`
4. After selection:
   - Call `bindJobItemToSessionApi()` to bind job item to session
   - Update context with `activeJobItem` and `job`
   - Start the production status event

### Dialog Component

`JobSelectionDialog` provides:
- Two-step selection: Job dropdown → Job Item dropdown
- Auto-selects if only one option available
- Shows job item statistics (planned, completed, remaining)
- Loading states for async operations
- Error handling with Hebrew messages

---

## Tests Passed

- Build successful (`npm run build`)
- TypeScript compilation clean

---

## Known Issues

None.

---

## Next Steps

Phase 3: Production Context Display
- Create `production-context-banner.tsx` component
- Show active job info when in production
- Add "Switch Job" functionality
