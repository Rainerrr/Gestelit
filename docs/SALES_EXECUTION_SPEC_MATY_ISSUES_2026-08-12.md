# Gestelit Sales Module Execution Spec

Source: Maty Berger, `עידן משימות אפליקציה.xlsx`, sent 2026-08-11 after the 11.8.26 review.

Saved: 2026-08-12

## Purpose

Turn Maty's issue list into an implementation backlog grounded in the current Gestelit code and the actual BINA data available today.

The target is not another spreadsheet view. The sales module should become an account-management workspace that answers:

- What should I do next?
- Which customers have gone quiet?
- Who owns each customer?
- What happened with this customer before?
- Which quotes are still alive and which orders came in?
- Which claims are complete and which are limited by missing BINA history?

## Current-State Finding

The workbook mixes completed fixes, partially implemented workflows, and BINA-dependent requests.

Already present in the current code:

- Personal salesperson dashboard under `/sales/dashboard`.
- Team dashboard under `/admin/sales-daily-log`.
- Maty can enter the team dashboard from his sales login.
- Activity editing by the salesperson who created the activity.
- Post-save form reset and automatic refresh of the draft timestamp.
- Date ranges, salesperson, client, activity-type, and status filters.
- Clickable personal activity-mix drilldowns.
- Personal and team XLSX exports using the selected filters.
- Client directory search with client group and salesperson fields.
- BINA-compatible local onboarding for a client that does not yet exist.
- Manual sales activity analytics, ICP signals, follow-up queues, and salesperson performance.

Important current limitations:

- Permanent customer ownership is not modeled separately from the last salesperson who logged an activity.
- The imported client index contains useful ownership/group metadata but no reliable retrospective CRM-touch history.
- Existing BINA client location is not populated; only locally staged clients currently carry area information.
- BINA quote tables (`DFHats*`) are not part of the sync contract.
- Orders, invoices, and other BINA sources are synced through bounded `TOP ($MaxRecentOrders)` extracts and cannot be treated as complete history.
- The current refresh button reloads data but gives weak visual feedback, which makes it appear ineffective.
- AI summarization has no safe copy action.

Production risks found during the code audit:

- Sales attachments are currently stored in a public bucket. Move them to private storage and serve short-lived signed URLs only after owner/team authorization.
- Filtered analytics are assembled from an application-memory fetch capped at 20,000 rows. Larger periods can silently undercount.
- Client suggestions/history are derived from a recent 80-row activity slice and are not a complete client timeline.
- Maty's current team access is implemented by issuing a generic admin session, which grants more than sales-management access.

## Issue Matrix

Status definitions:

- `Verified`: implemented in the current code.
- `Partial`: useful foundation exists, but the workflow is incomplete.
- `Missing`: can be implemented now without new BINA history.
- `BINA blocked`: requires a new or complete retrospective BINA source.

| # | Maty's request | Current status | Decision |
|---|---|---|---|
| 1 | Access to reports for Maty/account managers, including AI questions | Partial | Maty has team access. Replace ad-hoc/full-admin access with explicit sales scopes before adding more managers. Add a scoped sales AI workspace. |
| 2 | Copy an AI answer | Missing | Add a copy action with clipboard fallback and success/error feedback. |
| 3 | New activity keeps the previous activity time and requires a restart | Verified | Current form resets after save and refreshes untouched draft time every minute/focus. Preserve with regression tests. |
| 4 | Show customers not contacted for six months with a red warning | Partial/BINA blocked | A limited Gestelit-only version can ship now, but it must say `לא תועדה פנייה בגסטליט`. Authoritative `לא פנינו` requires BINA CRM-touch history. |
| 5 | Refresh button appears ineffective | Partial | Reload exists. Add loading state, last-refresh time, result feedback, and request de-duplication. |
| 6 | Correct text after submitting an activity | Verified | Own activities can be edited. Keep ownership and audit constraints. |
| 7 | Find customer ownership and previous history | Partial | Directory search and owner field exist. Add a client profile/detail page with canonical owner, activity timeline, commercial timeline, and coverage status. |
| 8 | Show permanent owner even when another manager logs an activity | Defect | Split `account_manager` from `activity_salesperson`. A new activity must never replace canonical ownership. |
| 9 | Filter by date using a calendar range | Verified | Custom date ranges exist in personal and team dashboards. Preserve mobile usability and URL/shareable state later. |
| 10 | Buttons to filter whom we met instead of relying on drilldown | Partial | Personal activity cards are clickable and event filters exist. Add quick filter chips to both dashboards and make `פגישות` open the underlying client/activity list. |
| 11 | Filter by client characteristic/location/sector | Partial/BINA blocked | Group can be used now. Area works only for locally staged clients; existing BINA customers require an enriched master-data sync. |
| 12 | Export every generated report to Excel | Partial | Filtered personal/team workbooks exist. Standardize export availability on client, dormant, quote, order, and drilldown reports as those screens are added. |
| 13 | Surface BINA CRM/existing customers untouched for 3-6 months | BINA blocked | Requires complete client universe and retrospective touch history, with source coverage metadata. |
| 14 | Personal report: live quotes, incoming orders, customer ranking, quote ranking | Partial/BINA blocked | Personal activity dashboard and ranking signals exist. Incoming orders can be added after complete order coverage; live/ranked quotes require `DFHats*` sync. |
| 15 | Reconcile BINA existing/CRM clients by segment/location | BINA blocked | Requires customer-master/CRM history, area enrichment, deterministic identity reconciliation, and complete snapshot metadata. |

## Product Definitions

### Customer ownership

Ownership must be explicit and stable.

- `account_manager`: canonical owner from the trusted BINA client master/client index or an approved local assignment.
- `activity_salesperson`: person who logged or performed one activity.
- `last_activity_salesperson`: most recent person who contacted the customer.
- `ownership_source`: `bina_master`, `approved_local`, or `missing`.
- `ownership_confidence`: `exact`, `inferred`, or `missing_data`.

Logging an activity for another manager's customer is allowed, but the form must show:

`הלקוח משויך לשרה. הפעילות תירשם על שמך ולא תשנה את השיוך.`

The current `mart_sales_client_activity` coalesces the last manual salesperson ahead of the imported owner. This must be replaced before ownership is used for management decisions.

### Customer touch

Do not infer a human sales contact from an invoice, order, or delivery.

A qualifying touch is a human interaction that actually occurred:

- Completed meeting or call.
- Completed follow-up where contact with the customer occurred.
- A sale activity only when it records a customer interaction, not merely an order-status update.
- A mapped BINA CRM interaction with a stable timestamp, actor, and outcome.

Lead creation, a scheduled next action, quote/order/invoice generation, delivery, and sync activity do not reset inactivity. Add an explicit `contact_occurred`/outcome field; until it exists, label the result as inferred from the activity type.

Store these concepts separately:

- `last_human_contact_at`: latest qualifying customer interaction.
- `last_commercial_activity_at`: latest quote, order, invoice, delivery, or human interaction.
- `contact_state`: `contacted`, `never_contacted`, or `unknown_before_crm_rollout`.

Commercial events are shown separately:

- Quote created/updated.
- Order received.
- Invoice issued.
- Delivery completed.

### Dormancy

- `active`: touch in the last 89 days.
- `attention`: no touch for 90-179 days, amber.
- `dormant`: no touch for 180+ days, red.
- `never_contacted`: complete customer snapshot exists but no touch exists.
- `unknown`: retrospective coverage is incomplete.

Personal queues include only customers whose canonical `account_manager` is the logged-in salesperson. Team managers may view all owners.

Until BINA CRM history is available, the UI wording must be:

- `לא תועדה פנייה בגסטליט ב-6 החודשים האחרונים`.
- Never `לא פנינו ללקוח`.

### Live quote

A quote is live only when its status mapping proves it is not won, lost, cancelled, expired, or converted to an order. Age alone does not determine status.

The quote mart must expose:

- Quote number/year.
- Customer code/name.
- Canonical account manager.
- Quote date and last update.
- Amount/currency.
- Status and mapped status label.
- Linked order number when converted.
- Age in days.
- Data coverage/confidence.

### Incoming order

An incoming order is a commercial customer order created/accepted during the selected period and attributed using canonical customer ownership. It is not a manually marked `won` activity, invoice, delivery, or manufacturing work order.

`DFHazmRashi` may be shown as an explicitly labeled production-work-order proxy, but it must not be reported as commercial order intake until the BINA vendor confirms the commercial order source and relationship.

## Target Roles And Access

| Capability | Salesperson | Sales manager | System admin |
|---|---:|---:|---:|
| Log/edit own activities | Yes | Yes | Yes |
| Personal dashboard/export | Own | Own | All/impersonation only when audited |
| Search client directory | Yes | Yes | Yes |
| View another salesperson's activity | No | Yes | Yes |
| Team dashboard/export | No | Yes | Yes |
| Sales AI over own data | Yes | Yes | Yes |
| Sales AI over team data | No | Yes | Yes |
| MES/BINA administration | No | No by default | Yes |

Add server-enforced scopes:

- `sales_activity_write`
- `sales_personal_view`
- `sales_team_view`
- `sales_export`
- `sales_ai_query`
- `sales_client_manage`

Do not grant a generic MES admin session merely to enable team-sales reporting for future managers.

## Target Screens

### 1. Sales home `/sales`

Keep the fast activity form, with these changes:

- Show selected customer's canonical owner below the customer field.
- Warn, but do not block, when logging against another owner's customer.
- Add `העתקה` next to the AI summary and suggested next action.
- Refresh button shows `מרענן...`, then `עודכן עכשיו` and the refresh time.
- After save, reset all activity-specific fields and set the timestamp to now.
- Preserve a user-entered timestamp only while the draft is dirty.

### 2. My dashboard `/sales/dashboard`

Add:

- Quick chips: `פגישות`, `שיחות`, `מכירות`, `פולואפים`, `לא דיברתי 3 חודשים`, `לא דיברתי 6 חודשים`.
- Client portfolio table/cards with owner, last touch, last commercial event, open value, and next action.
- Sections for `הצעות חיות`, `הזמנות שנכנסו`, and rankings, hidden behind honest coverage states until BINA data is ready.
- Every visible report inherits the same date/filter context and offers XLSX export.

### 3. Client profile `/sales/clients/[clientRef]`

Header:

- Customer name/code.
- Canonical account manager.
- Group, area, status.
- Last touch and dormancy badge.
- Data coverage badge.

Tabs:

- `פעילות`: Gestelit + mapped BINA CRM touches.
- `הצעות`: live/closed quotes.
- `הזמנות`: incoming orders.
- `חשבוניות ומשלוחים`: commercial context.
- `פרטי לקוח`: BINA/client-index fields and local pending status.

Raw source rows are not the primary UI.

### 4. Team dashboard `/admin/sales-daily-log`

Add filters for:

- Account manager.
- Customer.
- Date range.
- Activity type/status.
- Customer group.
- Area.
- Dormancy bucket.
- Coverage/confidence.

The dashboard must distinguish:

- Manual Gestelit activity outcomes.
- BINA quotes.
- BINA orders.
- BINA invoices.

Do not combine these into one unlabeled revenue number.

### 5. Sales AI

Add a sales-scoped assistant for salespeople and sales managers. No arbitrary SQL.

Approved tools:

- `get_my_sales_summary`
- `get_team_sales_summary`
- `get_client_profile`
- `get_client_touch_history`
- `get_dormant_clients`
- `get_live_quotes`
- `get_incoming_orders`
- `compare_clients`
- `get_sales_data_coverage`

Every answer includes source, date range, freshness, confidence, filters, and missing data. Copy uses a shared safe clipboard helper with a DOM fallback because browser clipboard permissions are not guaranteed.

## Mobile Information Architecture

The current responsive layout does not overflow horizontally at a 390px viewport, but the `/sales` page is still a very long stacked workflow.

Use four persistent mobile destinations:

- `דיווח`
- `היסטוריה`
- `הסיכום שלי`
- `לקוחות`

On the activity form, show customer, activity type, date, note, and save first. Put amounts, files, calendar, and expanded AI fields behind clearly labeled expandable sections.

On the management dashboard:

- Put advanced filters in a bottom sheet.
- Keep applied-filter chips visible above the dashboard.
- Keep a sticky `הצג תוצאות` action while the filter sheet is open.
- Open KPI/drilldown data in a full-height mobile sheet rather than a compressed table.

## Backend And Data Changes

### Immediate schema/view corrections

Add or replace:

- `sales_account_assignments`
- `mart_sales_client_profile`
- `mart_sales_client_touch_history`
- `mart_sales_client_dormancy`
- `mart_sales_personal_portfolio`
- `mart_sales_data_coverage`

For production-scale reporting, move aggregation and pagination into database views/RPCs. Do not download a capped activity population and aggregate it in application memory.

`mart_sales_client_profile` must keep canonical owner and latest actor in separate columns.

Reject invalid supplied activity timestamps. The current normalizer falls back to the current time, which can incorrectly make a dormant customer appear recently contacted.

### APIs

Add:

- `GET /api/sales/clients/[clientRef]`
- `GET /api/sales/dormant`
- `GET /api/sales/portfolio`
- `GET /api/sales/reports/quotes`
- `GET /api/sales/reports/orders`
- `POST /api/sales/ai/chat`

Use private attachment storage and an authorized signed-download endpoint. Existing public attachment URLs must be migrated or invalidated.

Extend existing dashboard/activity/export APIs with:

- `customerGroup`
- `area`
- `accountManager`
- `dormancyBucket`
- `coverage`

All filters must execute server-side and flow into XLSX exports.

### Refresh behavior

For each sales data loader:

- Ignore stale responses using a request ID or abort controller.
- Disable the refresh button during an active request.
- Rotate the refresh icon while loading.
- Show the last successful refresh time.
- Preserve current filters.
- Show a stable public error code and retry action on failure.

## BINA Retrospective Data Contract

The following work cannot be completed honestly from the current sync alone.

### Required sources

1. Customer master/CRM universe
   - Customer code and canonical name.
   - CRM vs established-client classification.
   - Permanent account manager.
   - Group/sector.
   - Area code and area label.
   - Active/inactive status.
   - Opened/updated timestamps.

2. CRM touch history
   - Client code.
   - Event timestamp.
   - Account manager/actor.
   - Event type.
   - Outcome/status.
   - Notes or safe summary.
   - Stable source key and updated timestamp.

3. Quotes
   - `DFHatsRashi` plus the required `DFHats*` detail tables.
   - Full status dictionary and conversion link to order.
   - Stable header/detail keys.
   - At least 2025-01-01 onward, preferably complete open quotes plus 24 months history.

4. Orders
   - `DFHazmRashi` and required details.
   - Confirm whether `DFHazmRashi` is the commercial-order grain or a downstream production/work-order grain.
   - Map customer-order-to-work-order cardinality before counting order intake.
   - Complete 2025-01-01 onward history, not only the latest `TOP N` window.
   - Created date, customer, salesperson/owner, amount when available, status, linked quote.

5. Sales invoices
   - Complete `HeshbonitRashi/Nigrar` coverage for the reporting window.
   - Customer, salesperson, order links, amount, currency, document date.

### Coverage metadata

Every historical source must report:

- `sync_scope`
- `source_row_count`
- `source_min_date`
- `source_max_date`
- `source_min_id`
- `source_max_id`
- `is_complete_snapshot`
- `extracted_at`

Dashboards and AI must display `מדגם חלקי` until completeness is proven.

Track totals at sync-run level, not only the most recent HTTP batch. A table sent in many batches must report cumulative source/sent/upserted counts. Full snapshots also need a seen/not-seen or tombstone mechanism because the current upsert path does not remove records deleted in BINA.

### Identity reconciliation

Use customer code as the primary identity. Name matching is a reviewed fallback only.

Reconciliation states:

- `exact_code_match`
- `approved_manual_match`
- `name_candidate`
- `unmatched`
- `conflict`

Never auto-merge two customer records based only on a normalized name.

## Implementation Order

### Phase 0: close immediate defects

1. Correct customer-ownership semantics.
2. Add AI copy with clipboard fallback.
3. Add visible refresh state and last-refresh time.
4. Add regression tests for post-save reset/edit behavior.
5. Replace broad manager access with explicit sales scopes before onboarding more managers.
6. Make sales attachments private and add authorized signed downloads.
7. Remove the 20,000-row analytics ceiling and the 80-row client-history shortcut.

### Phase 1: useful workflows with current data

1. Build client profile/history from the client index and Gestelit activities.
2. Add ownership warnings in the activity form.
3. Add quick filter chips and drilldowns.
4. Add group/owner filters and server-side export parity.
5. Add a limited dormant-client queue labeled with Gestelit-only coverage.
6. Add sales-scoped AI over current trusted data.

### Phase 2: BINA historical ingestion

1. Discover and map BINA CRM-touch and quote schemas.
2. Confirm the commercial order grain and quote-to-order relationship.
3. Add `DFHats*` and complete historical order/invoice extraction.
4. Backfill from 2025-01-01 with low-impact batching and checkpoints.
5. Prove source coverage and reconcile identities.
6. Build live quotes, order intake, authoritative dormancy, and client segmentation.
7. Validate source workbook date locale explicitly; the current client-index parser assumes `MM/DD/YYYY`.

### Phase 3: operational intelligence

1. Salesperson portfolio and manager review queues.
2. Quote aging/conversion analytics.
3. Customer/contact cadence recommendations.
4. Evidence-backed AI comparisons and weekly summaries.

## Acceptance Tests

### Access

- A salesperson can see only their own activity/report data.
- A sales manager can see all salespeople without receiving unrelated MES admin capabilities.
- API calls enforce the same scope as the UI.
- Sales AI never returns another salesperson's data without `sales_team_view`.
- A salesperson cannot download another user's private attachment unless an authorized team scope allows it.

### Activity form

- Saving an activity resets client, notes, amounts, attachments, next action, and timestamp.
- A manually changed event time is preserved while editing the draft.
- Editing changes the existing row rather than creating a duplicate.
- Invalid activity dates are rejected and never silently replaced with the current time.
- AI output can be copied on browsers where Clipboard API permission is denied.
- Refresh shows progress, success time, and failure feedback.
- Editing creates an audit entry with actor, timestamp, and changed fields.

### Ownership and client history

- Logging on Sara's customer as Maty preserves Sara as `account_manager` and records Maty as `activity_salesperson`.
- Client search returns canonical owner and source confidence.
- Client profile shows prior Gestelit activity in descending time order.
- Missing BINA history is visible, not rendered as zero activity.
- Client history pagination returns complete stable pages rather than only the latest 80 activities.

### Filters and export

- Date, owner, client, event type, status, group, area, and dormancy filters are server-enforced.
- Dashboard totals, drilldowns, and XLSX contain the same filtered population.
- Exports identify scope, generated time, filters, currencies, and coverage limitations.
- Reports above 20,000 activities reconcile to database aggregate totals without silent truncation.

### BINA-dependent analytics

- Dormancy is authoritative only when client-universe and touch-history coverage are complete.
- Live quotes exclude converted/cancelled/lost/expired quotes according to mapped statuses.
- Incoming-order counts reconcile to BINA source totals for the same period.
- Commercial orders and manufacturing work orders remain distinct grains with an explicit relationship.
- A multi-batch sync reports cumulative run totals, and deleted BINA records are detectable through reconciliation/tombstones.
- Money remains separated by currency.
- AI cites the BINA/Gestelit views used and states what it could not verify.

## Release Gates

Do not mark the BINA-dependent items complete until:

- BINA source tables and keys are documented.
- Historical backfill completes without harming the production ERP.
- UTF-8/Hebrew text quality passes sampling.
- Coverage metadata proves the requested reporting window.
- Client identity conflicts are reviewed.
- Query plans meet dashboard latency targets.
- Desktop and 390px mobile E2E flows pass in production.

## Decisions Required From BINA/Business Owners

Resolve these before Phase 2 implementation:

1. Which BINA table is the authoritative customer master and which table stores CRM contacts/tasks?
2. Which `DFHats*` header/detail keys and statuses define a live quote?
3. Is `DFHazmRashi` a commercial order, production work order, or both at different stages?
4. What is the exact quote-to-order and order-to-work-order cardinality?
5. Which source is authoritative for permanent account-manager ownership?
6. Are 90 and 180 days the approved dormancy thresholds for every segment, or should cadence vary by client group?
7. How should reassignment history be handled when an account manager changes?

## Code Evidence

Primary current implementation:

- `app/sales/_components/sales-portal.tsx`
- `app/sales/_components/sales-personal-dashboard.tsx`
- `app/sales/_components/sales-client-index.tsx`
- `app/admin/sales-daily-log/_components/sales-daily-log-dashboard.tsx`
- `app/admin/sales-daily-log/_components/sales-dashboard-filters.tsx`
- `app/admin/sales-daily-log/_components/sales-intelligence-dashboard.tsx`
- `app/api/sales/*`
- `app/api/admin/sales-daily-log/*`
- `lib/data/sales-log.ts`
- `lib/data/sales-analytics.ts`
- `lib/reports/sales-workbook.ts`
- `lib/auth/sales-session.ts`
- `supabase/migrations/20260714123000_create_bina_client_index.sql`
- `supabase/migrations/20260719120000_create_pending_bina_clients.sql`
- `supabase/migrations/20260801120000_sales_operational_analytics.sql`
- `supabase/migrations/20260803113000_sales_filtered_analytics.sql`
- `app/api/bina/sync/route.ts`
