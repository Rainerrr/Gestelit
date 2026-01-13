# Phase 6: Admin UI - COMPLETED

## Status: COMPLETED
Completed: 2026-01-09

## Target Branch
- **Branch:** `production-line-implementation`
- **Project Ref:** `yzpwxlgvfkkidjsphfzv`
- **Parent Project:** `nuhbytocovtywdrgwgzk` (Gestelit - main)

## Files Created

### API Wrappers (lib/api/admin-management.ts - Modified)
Added new admin API wrapper functions:

**Production Lines:**
- `fetchProductionLinesAdminApi(params?)` - Fetch all production lines
- `getProductionLineAdminApi(id)` - Get single production line by ID
- `createProductionLineAdminApi(payload)` - Create new production line
- `updateProductionLineAdminApi(id, payload)` - Update production line
- `deleteProductionLineAdminApi(id)` - Delete production line
- `updateProductionLineStationsAdminApi(lineId, stationIds)` - Update line stations
- `fetchAvailableStationsForLineAdminApi(lineId?)` - Get stations available for line

**Job Items:**
- `fetchJobItemsAdminApi(jobId, params?)` - Fetch job items for job
- `createJobItemAdminApi(jobId, payload)` - Create new job item
- `updateJobItemAdminApi(jobId, itemId, payload)` - Update job item
- `deleteJobItemAdminApi(jobId, itemId)` - Delete job item

### API Endpoint (app/api/admin/production-lines/available-stations/route.ts - Created)
New endpoint that returns stations available for assignment to a production line.
- Excludes stations already assigned to other lines
- Includes stations from current line if editing

### Production Lines Management Components

**production-lines-management.tsx (Created)**
Main component for listing and managing production lines:
- Table view with name, code, stations preview, active status
- Inline actions: edit stations, edit line, delete line
- Support for mobile view
- Lock detection (prevents deletion of lines with active jobs)

**production-line-form-dialog.tsx (Created)**
Dialog for creating/editing production lines:
- Name input (required)
- Code input (optional, unique)
- Active/inactive toggle
- Success/error message handling

**production-line-stations-dialog.tsx (Created)**
Dialog for managing station order in a production line:
- Add stations from available pool
- Remove stations from line
- Move up/down buttons for reordering
- Lock detection (prevents editing when jobs are active)
- Shows terminal station indicator

### Job Items Management Components

**job-items-dialog.tsx (Created)**
Comprehensive dialog for managing job items:
- Lists all job items with type (station/line), progress, planned quantity
- Add new item form:
  - Toggle between "single station" and "production line" types
  - Station selector (only shows unassigned stations)
  - Production line selector
  - Planned quantity input
- Inline quantity editing
- Delete item with confirmation
- Progress bars showing completion percentage

### Dashboard Integration (management-dashboard.tsx - Modified)

**New Tab: "קווי ייצור" (Production Lines)**
Added fourth tab to management dashboard alongside Workers, Stations, Jobs:
- Tab uses GitBranch icon
- Full production lines CRUD functionality
- Station editing dialog integration

**State Management:**
- `productionLines: ProductionLineWithStations[]`
- `isLoadingLines: boolean`
- `editingLineStations: ProductionLineWithStations | null`

**Handler Functions:**
- `loadProductionLines()` - Load all lines
- `handleAddProductionLine(payload)` - Create new line
- `handleUpdateProductionLine(id, payload)` - Update line
- `handleDeleteProductionLine(id)` - Delete line
- `handleEditLineStations(lineId)` - Open stations editor
- `handleSaveLineStations(lineId, stationIds)` - Save station order
- `handleFetchAvailableStations(lineId?)` - Get available stations
- `handleCheckLineLocked(lineId)` - Check if line has active jobs

### Jobs Management Integration (jobs-management.tsx - Modified)

**New "Manage Items" Button:**
Added Package icon button to job actions (both mobile and desktop views):
- Opens JobItemsDialog for the selected job
- Positioned before Edit and Delete buttons
- Blue highlight color on hover

**State Added:**
- `jobItemsJob: Job | null` - Currently selected job for items dialog

## UI Features

### Production Lines Tab
1. **List View**
   - Shows all production lines with name, code, station count, active status
   - Station preview badges showing first 3 stations
   - Quick actions: edit stations, edit details, delete

2. **Create/Edit Dialog**
   - Name and code fields
   - Active/inactive toggle with visual feedback
   - Validation and error handling

3. **Stations Editor Dialog**
   - Drag-free reordering with up/down buttons
   - Add from available pool dropdown
   - Remove button on each station
   - Position numbers and "terminal" badge
   - Lock indicator when jobs are active

### Job Items Management
1. **Items Dialog** (accessible via Package icon on each job)
   - Lists existing items with type indicators
   - Progress bars and completion stats
   - Add new item form with type toggle
   - Inline quantity editing
   - Delete with active session protection

2. **Add Item Form**
   - Type selector (Station vs Production Line)
   - Contextual dropdown (stations or lines)
   - Planned quantity input
   - Smart filtering (stations in lines excluded from single-station dropdown)

## Error Handling

Added Hebrew error messages to `errorCopy` in management-dashboard.tsx:
- `CODE_ALREADY_EXISTS` - קוד קו ייצור כבר קיים במערכת
- `HAS_ACTIVE_JOBS` - לא ניתן למחוק קו ייצור עם עבודות פעילות
- `PRODUCTION_LINE_NOT_FOUND` - קו ייצור לא נמצא
- `PRODUCTION_LINE_CREATE_FAILED` - יצירת קו ייצור נכשלה
- `PRODUCTION_LINE_UPDATE_FAILED` - עדכון קו ייצור נכשל
- `PRODUCTION_LINE_DELETE_FAILED` - מחיקת קו ייצור נכשלה
- `STATION_ALREADY_IN_LINE` - אחת או יותר מהתחנות כבר משויכת לקו אחר

## Type Check Results
All changes pass TypeScript compilation with no new errors.

## User Flow

### Creating a Production Line
1. Go to Admin → Manage → Production Lines tab
2. Click "הוסף קו ייצור"
3. Enter name and optional code
4. Save
5. Click Settings icon to add/order stations
6. Add stations from dropdown, reorder as needed
7. Save

### Configuring Job Items
1. Go to Admin → Manage → Jobs tab
2. Find job, click Package icon
3. Click "הוסף פריט"
4. Select type (station or line)
5. Select station/line from dropdown
6. Enter planned quantity
7. Save

### Worker Access
After configuration:
- Workers selecting the job will only see stations defined in job items
- Workers assigned to stations in production lines can work on line items
- Jobs without job items are blocked (from Phase 5)

## Known Issues
None

## Next Steps
Proceed to Phase 7: Integration Tests
- Test allowed-stations API returns only job-relevant stations
- Test session start rejects stations not allowed for job
- Test legacy sessions without job_item fields still work
- Test WIP balance operations (increase/decrease paths)
- Test downstream consumption protection
