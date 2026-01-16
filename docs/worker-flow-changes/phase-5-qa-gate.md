# Phase 5: First Product QA Gate

**Status:** Completed
**Completed:** 2026-01-13

---

## Overview

Phase 5 implements a first product QA gate for stations that require quality approval before production can begin. When a station has `requires_first_product_qa = true`, workers must submit a QA request and wait for admin approval before starting production on a new job item.

---

## Database Migrations

The following columns were added in Phase 1:

| Column | Table | Purpose |
|--------|-------|---------|
| `requires_first_product_qa` | `stations` | Flag to enable QA gate for a station |
| `job_item_id` | `reports` | Links QA reports to specific job items |
| `is_first_product_qa` | `reports` | Marks reports as first product QA requests |

---

## Files Created

| File | Purpose |
|------|---------|
| `lib/data/first-product-qa.ts` | Server-side QA check/request functions |
| `app/api/first-product-qa/check/route.ts` | GET endpoint to check QA approval status |
| `app/api/first-product-qa/request/route.ts` | POST endpoint to submit QA request |
| `components/work/first-product-qa-dialog.tsx` | Dialog for QA request/waiting/approved states |

---

## Files Modified

| File | Changes |
|------|---------|
| `lib/types.ts` | Added `requires_first_product_qa` to Station, `job_item_id` and `is_first_product_qa` to Report |
| `lib/api/client.ts` | Added `checkFirstProductQAApi()` and `submitFirstProductQARequestApi()` functions |
| `app/(worker)/work/page.tsx` | Integrated QA gate into job selection flow |

---

## QA Flow

### Standard Flow (QA Not Required)
```
1. Worker clicks production status
2. Job Selection Dialog opens
3. Worker selects job/job item
4. Production starts immediately
```

### QA Required Flow
```
1. Worker clicks production status
2. Job Selection Dialog opens
3. Worker selects job/job item
4. System checks QA approval status:

   If NOT approved and NO pending request:
   → QA Request Dialog opens (request mode)
   → Worker can take photo, add notes
   → Worker submits request
   → Dialog switches to waiting mode

   If NOT approved and HAS pending request:
   → QA Waiting Dialog opens
   → Shows "waiting for approval" message
   → Polls every 5 seconds for approval

   If APPROVED:
   → Production starts immediately

5. When admin approves:
   → Dialog shows "approved" briefly
   → Production starts automatically
```

---

## Data Layer Functions

### `checkFirstProductQAApproval(jobItemId, stationId)`
Queries reports table for first product QA status:
- Returns `approved: true` if approved report exists
- Returns `pendingReport` if new request exists
- Returns `approvedReport` if approval exists

### `createFirstProductQARequest(payload)`
Creates a report with:
- `type: "general"` (uses standard approval flow)
- `is_first_product_qa: true`
- `job_item_id` linking to specific job item
- `status: "new"` (set by trigger)

### `getPendingFirstProductQARequests()`
Returns all pending QA requests for admin view.

### `stationRequiresFirstProductQA(stationId)`
Checks if a station requires QA approval.

---

## API Endpoints

### GET `/api/first-product-qa/check`
Query params: `jobItemId`, `stationId`

Response:
```typescript
{
  approved: boolean;
  pendingReport: Report | null;
  approvedReport: Report | null;
}
```

### POST `/api/first-product-qa/request`
Form data:
- `jobItemId` (required)
- `stationId` (required)
- `sessionId` (optional)
- `workerId` (optional)
- `description` (optional)
- `image` (optional, file)

Response:
```typescript
{
  report: Report;
}
```

---

## Dialog Component

The `FirstProductQADialog` supports three modes:

### Request Mode
- Shows image upload button (camera icon)
- Shows notes textarea
- "Send for Approval" button
- Can be cancelled

### Waiting Mode
- Shows clock icon with "waiting for approval" message
- Shows timestamp of when request was sent
- Auto-polls for approval every 5 seconds
- Close button returns to work page (without production)

### Approved Mode
- Shows checkmark with "QA Approved" message
- Auto-proceeds to production after 1.5 seconds

---

## Work Page Integration

### State Variables Added
```typescript
const [isQADialogOpen, setQADialogOpen] = useState(false);
const [qaDialogMode, setQADialogMode] = useState<FirstProductQADialogMode>("request");
const [qaStatus, setQAStatus] = useState<FirstProductQAStatus | null>(null);
const [isQASubmitting, setIsQASubmitting] = useState(false);
const [pendingQAJobSelection, setPendingQAJobSelection] = useState<JobSelectionResult | null>(null);
```

### Flow Changes in `handleJobSelectionComplete`
1. Check if station requires QA
2. If yes, call `checkFirstProductQAApi()`
3. If not approved:
   - Store job selection in `pendingQAJobSelection`
   - Close job selection dialog
   - Open QA dialog in appropriate mode
4. If approved, proceed directly to production

### Approval Polling
When in waiting mode, useEffect polls every 5 seconds:
- Checks QA status via API
- If approved, switches to approved mode
- After 1.5s delay, proceeds to production automatically

---

## Admin Approval

QA requests use the existing reports approval system:
- Reports appear in admin reports page with `is_first_product_qa = true`
- Admin uses existing `PATCH /api/admin/reports/[id]` to approve
- Setting `status: "approved"` triggers worker's polling to detect approval

---

## Tests Passed

- Build successful (`npm run build`)
- TypeScript compilation clean

---

## Known Issues

None.

---

## Future Enhancements

1. **Admin QA Dashboard** - Dedicated view for QA requests with filtering
2. **Push Notifications** - Notify admin of new QA requests
3. **QA Request History** - Show previous QA approvals for job item
4. **Batch Approval** - Approve multiple QA requests at once
5. **QA Rejection** - Allow admin to reject requests with feedback
