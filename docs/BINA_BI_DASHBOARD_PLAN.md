# BINA BI Dashboard Implementation Plan

Saved: 2026-05-14

## Objective

Turn `/admin/bina` from synchronized BINA table browsing into a polished operational BI layer for Gestelit.

The target product is not "Excel inside the app". It is a decision cockpit for owners, managers, sales, purchasing, finance, and production:

- Show what changed, what is late, what is blocked, and what needs action.
- Connect BINA ERP data to Gestelit floor data and human workflow state.
- Keep all BINA data read-only.
- Use typed staging/mart/aggregate views instead of raw JSONB in UI and AI.
- Let AI explain, compare, cite, and suggest next questions/actions without executing writes.

## Current Baseline

Relevant local files:

- `app/admin/bina/_components/bina-dashboard.tsx`
- `lib/data/bina.ts`
- `lib/ai/tools/bina-tools.ts`
- `supabase/migrations/20260514090000_bina_analytics_ai.sql`
- `supabase/migrations/20260514103000_bina_finance_workbench.sql`
- `app/admin/_components/status-charts.tsx`

What already exists:

- `/admin/bina` has tabs for overview, production, purchasing, suppliers, finance, sales, deliveries, AI, and sync.
- BINA sync tables are already converted into staging/mart views for many domains.
- Finance has started moving toward a workbench with summary, aging, exceptions, detail route, date quality, currency grouping, and drawer support.
- AI tools exist and cover broad BINA domains.
- Recharts is available and already used in admin status charts.
- A persistent admin AI assistant exists.

Main gap:

- Most BINA tabs still render as plain tables, with limited operational hierarchy.
- Many views answer "what rows exist?" rather than "what should I care about now?"
- Some AI and UI paths still depend on row-limited fetches, which is acceptable for drilldowns but not for KPI truth.
- The sync screen is still closer to a technical log than a manager-friendly freshness and coverage dashboard.

## Product Principles

1. Exception-first
   - Risk queues, stale data, overdue work, blocked suppliers, and suspicious finance rows lead the screen.
   - Tables move below summaries and are used for drilldown.

2. Aggregates before rows
   - KPIs and charts come from database aggregates/RPCs/materialized views.
   - Row lists are capped, paginated, and clearly treated as samples or drilldowns.

3. Read-only BINA
   - UI and AI never mutate BINA.
   - Imports into Gestelit stay human-confirmed workflows.

4. RTL and mobile first
   - Hebrew labels, RTL layout, mobile cards, sheet drawers, accessible tap targets.
   - Tables are not the primary mobile experience.

5. Cross-domain thinking
   - Production risk should connect to purchasing, suppliers, finance, deliveries, and sales.
   - Finance rows should link to customer, supplier, invoice, delivery, work order, and purchase context when available.

6. AI with citations
   - AI answers must cite views/tables, freshness, filters, confidence, and what it could not verify.
   - AI should proactively suggest the next useful comparison or question.

## Target Information Architecture

Keep the BINA entry under:

`/admin/bina`

Tabs remain:

1. `סקירה`
2. `פק״עות`
3. `רכש`
4. `ספקים`
5. `כספים`
6. `מכירות`
7. `משלוחים`
8. `סנכרון`
9. AI available as persistent assistant, not only as a separate tab

The AI tab can stay as a full chat workspace, but the persistent assistant button should be available from every BINA screen with screen-aware context.

## Shared UI Components To Build

Create reusable BINA dashboard components instead of expanding the current monolith:

- `BinaDashboardShell`
  - Owns tab state, shared filters, screen context, loading/error states.

- `DomainKpiStrip`
  - Compact KPI cards with trend, freshness, confidence, and data-quality badges.

- `MiniChartCard`
  - Reusable chart card for donut, bar, trend line, stacked bars, and empty states.

- `OperationalQueue`
  - Prioritized issue list: risk reason, severity, linked entity, next action.

- `BinaDataGrid`
  - Dense paginated drilldown table with mobile card fallback.

- `BinaEntityDrawer`
  - Rich review drawer using `Sheet`, not raw JSON first.
  - Shows timeline, related entities, source citations, and contextual AI prompts.

- `DataQualityBanner`
  - Flags stale sync, suspicious dates, mojibake/`????`, missing balances, and inferred values.

- `RelationshipMap`
  - Lightweight relationship block: work order -> purchase -> supplier -> delivery -> invoice.
  - Start with cards/lines, not a heavy graph library.

- `BinaEmptyState`
  - Domain-specific empty, stale, and error states.

## Data Layer Plan

Keep four layers:

1. Raw sync tables
   - Existing `bina_*` JSONB tables.
   - Sync-owned only.
   - App and AI do not read these directly except via controlled staging/mart definitions.

2. Staging views
   - Typed extraction views from raw JSONB.
   - Stable English/Hebrew labels and casts.
   - Preserve `bina_id`, source table, synced timestamp, and data-quality flags.

3. Business marts
   - Entity-level operational views used by UI and AI.
   - Existing examples: `mart_bina_work_order_status`, `mart_bina_purchase_flow`, `mart_bina_supplier_aging`, `mart_bina_finance_transactions`, `mart_bina_sales_status`, `mart_bina_delivery_status`, `mart_bina_sync_health`.

4. BI aggregates / RPCs
   - New aggregate layer for dashboards and AI conclusions.
   - Must not rely on `.limit(5000)` style sampling.

## Required Aggregate Views / RPCs

Add these before making dashboard KPIs look authoritative:

- `rpc_bina_dashboard_summary`
  - One response for overview cockpit KPIs, trends, freshness, and top exceptions.

- `mart_bina_cross_domain_risk`
  - Unified risk queue across production, purchasing, suppliers, finance, deliveries, sync.

- `mart_bina_work_order_metrics_daily`
  - Due buckets, late/risky counts, unimported counts, quantity mismatch counts, completed/active signals.

- `mart_bina_purchase_metrics`
  - Open request lines, open quantity, open amount, top blockers, item/supplier exposure.

- `mart_bina_supplier_aging_buckets`
  - Supplier exposure by currency, overdue bucket, affected work orders/deliveries.

- `mart_bina_sales_metrics_daily`
  - Sales amount, invoice count, top customers, salesperson distribution, due/collection relationship.

- `mart_bina_delivery_metrics`
  - Open deliveries, days open, returned/received, carrier/supplier workload.

- `mart_bina_finance_metrics_daily`
  - Receivables, payables, overdue, due this week, suspicious date count, missing balance count.

- `mart_bina_finance_party_aging`
  - Aging by customer/supplier and currency.

## Screen Specifications

### 1. סקירה

Purpose: owner/manager cockpit.

Top:

- Last successful sync, stale tables, failed tables.
- Work orders at risk.
- Purchasing blockers.
- Supplier/finance exposure.
- Sales/delivery movement since last sync.

Middle:

- Cross-domain risk queue from `mart_bina_cross_domain_risk`.
- "What changed since last sync" grouped by domain.
- Trend cards: work orders, purchase requests, sales invoices, open deliveries, overdue finance.

Bottom:

- Domain health cards with drilldown CTAs.
- AI prompt strip: "סכם לי את היום", "מה דורש טיפול עכשיו?", "מה השתנה מהסנכרון הקודם?"

### 2. פק״עות

Purpose: operational production bridge between BINA and Gestelit.

Dashboard:

- Due bucket chart.
- Import/link status chart: not imported, linked, quantity mismatch, no floor activity.
- Risk queue: late, no activity, missing import, changed due date.
- Recent work order trend.

Detail drawer:

- BINA header.
- Gestelit link status and job progress.
- Production rows by station.
- Quantity/date discrepancies.
- Related purchasing, supplier, delivery, finance rows.
- Human-confirmed import action.
- AI actions: `למה זה בסיכון?`, `בדוק קשר לרכש`, `סכם פק״ע`.

### 3. רכש

Purpose: find material and purchasing blockers.

Dashboard:

- Open purchase request count and amount.
- Goods receipts trend.
- Top open items.
- Top suppliers by open commitment.
- Blocker queue linked to affected work orders when known.

Detail drawer:

- Request/receipt row.
- Supplier and item.
- Remaining quantity.
- Related work order/delivery/supplier invoice when known.

### 4. ספקים

Purpose: supplier operational health.

Dashboard:

- Supplier exposure by aging bucket.
- Open balance by currency.
- Late/risky supplier commitments.
- Recently active suppliers.
- Suppliers affecting active work orders.

Detail drawer:

- Supplier summary.
- Open invoices/payables.
- Goods receipts and purchase rows.
- Deliveries in/out when mapped.
- AI actions: `סכם מצב ספק`, `נסח הודעה לספק`, `מה תקוע אצל הספק?`

### 5. כספים

Purpose: operational finance workbench, not accounting replacement.

Already started; finish and make it visual:

- KPI strip:
  - חוב פתוח
  - חוב באיחור
  - חשבוניות לקוח
  - חשבוניות ספק
  - פירעון השבוע
  - חריגות נתונים

- Charts:
  - Receivable/payable split by currency.
  - Aging bars.
  - Due this week.
  - Suspicious/missing data quality.

- Queue:
  - Exception-first finance queue by risk score.
  - Suspicious dates excluded from aging KPIs and shown separately.
  - Unknown balances are unknown/inferred, never rendered as false zero.

- Detail drawer:
  - Amount, balance, due status, source table, synced date.
  - Linked customer/supplier, work order, delivery, purchasing rows.
  - AI actions: `למה זה באיחור?`, `בדוק קשר לפק״ע/משלוח`, `סכם מצב לקוח`, `סכם מצב ספק`.

### 6. מכירות

Purpose: connect BINA sales data and the new daily sales log.

Dashboard:

- Sales invoices over time.
- Top customers.
- Salesperson activity from BINA + daily sales log.
- Customer risk: overdue finance + open deliveries + active work orders.
- Cross-links to finance and deliveries.

Detail drawer:

- Customer/invoice summary.
- Linked work orders, delivery, finance row.
- Related salesperson daily log entries.
- AI actions: `סכם מצב לקוח`, `מצא לקוחות שכדאי לחזור אליהם`, `השווה מכירות לפעילות אנשי מכירות`.

### 7. משלוחים

Purpose: show what left, what returned/closed, and what is stuck.

Dashboard:

- Open deliveries.
- Days-open buckets.
- Returned/received count.
- Carrier/supplier workload.
- Deliveries linked to unpaid invoices or late work orders.

Detail drawer:

- Delivery header and lines.
- Related customer, work order, invoice, supplier/purchase context.
- AI actions: `מה תקוע?`, `מה ההשפעה על לקוח/פק״ע?`

### 8. סנכרון

Purpose: explain data trust, not just logs.

Dashboard:

- Freshness matrix by source table.
- Last good sync and last failed sync.
- Upsert counts/errors by table.
- Stale warning after 6 hours.
- Data coverage by domain.
- Recent log table below, collapsed by default.

No secrets and no remote trigger in v1.

### 9. AI Assistant

Persistent assistant button available everywhere in admin BINA context.

Context sent to AI:

- Current screen/tab.
- Active filters.
- Selected row/entity.
- Data freshness summary.
- Allowed tool domains.

AI personality:

- Proactive and operational.
- Always suggests the next useful question, comparison, or action.
- Broad enough to draw conclusions across domains, but only via approved tools.

AI must always return:

- Answer.
- Cited source views/tables.
- Freshness.
- Confidence: exact / inferred / missing data.
- Filters used.
- Suggested next action.
- What could not be verified.

## AI Tooling Amendments

Current AI tools are broad, which is good, but dashboards need stronger aggregate-backed tools.

Add or revise tools:

- `get_bina_dashboard_summary`
- `get_cross_domain_risk_map`
- `get_work_order_operational_profile`
- `get_customer_operational_profile`
- `get_supplier_operational_profile`
- `get_finance_exposure_by_party`
- `get_delivery_blockers`
- `get_sales_vs_activity_summary`
- `compare_domains`
  - Inputs: domains, date range, entity identifiers.
  - Only uses approved marts/RPCs.

Keep blocked:

- Arbitrary SQL.
- Secrets.
- Write-back to BINA.
- Direct mutations in Gestelit unless routed through human-confirmed UI workflows.
- Unrestricted exports.

## Implementation Phases

### Phase 0: Component Split

- Extract reusable components from `bina-dashboard.tsx`.
- No business behavior change.
- Keep current APIs working.
- Add visual empty/error/stale states.

### Phase 1: BI Aggregate Backend

- Add aggregate views/RPCs.
- Add API routes/types for summary, risk queues, trends, and chart series.
- Remove KPI dependence on sampled row fetches.
- Add indexes/materialized views where needed.

### Phase 2: Overview Cockpit

- Replace overview tab with real BI cockpit.
- Add KPI strip, charts, cross-domain risk queue, freshness panel.
- Browser-check desktop and mobile.

### Phase 3: Domain Dashboards

- Upgrade production, purchasing, suppliers, sales, deliveries, and sync.
- Finance already has workbench direction; add charts and tighten drawer.
- Convert tables into drilldowns/mobile cards.

### Phase 4: AI Integration

- Make AI assistant screen-aware.
- Add aggregate-backed AI tools.
- Add citations, freshness, confidence, and proactive next-question suggestions.
- Add tests for blocked requests and broad cross-domain questions.

### Phase 5: Polish And Rollout

- Visual QA across desktop/mobile.
- Performance profiling against real Supabase data.
- Validate RTL and Hebrew text.
- Add daily/weekly AI summary only after manual chat proves reliable.

## Production Readiness Checklist

- Migrations are additive and reversible.
- Views/RPCs are read-only.
- No BINA write-back exists.
- KPIs come from database aggregates, not capped client/API samples.
- Query plans checked on high-volume tables.
- Cursors/pagination stable for drilldowns.
- Currency totals grouped by currency.
- Suspicious dates excluded from aging and trend KPIs.
- Missing/unknown balances shown as unknown/inferred, not `0`.
- Admin auth enforced on every route.
- AI routes rate-limited and audited.
- AI tool calls have row limits, date limits, timeouts, and source citations.
- Sync failures and stale tables visible without exposing secrets.
- Existing dirty work is not overwritten during implementation.

## UI/UX Acceptance Criteria

- `/admin/bina` feels like a BI cockpit, not a spreadsheet.
- Each tab has a clear "what matters now" top section.
- Dense tables exist only as drilldowns.
- Mobile uses cards/sheets, not horizontal table dependence.
- RTL alignment is correct for labels, numbers, dates, and mixed Hebrew/English identifiers.
- Charts have Hebrew legends and accessible empty states.
- Risk/severity/freshness badges are consistent across tabs.
- Detail drawer shows operational summary first and raw/source details last.
- AI prompt buttons are contextual to the current row/screen.
- Loading, stale, empty, error, and partial-data states are designed.

## Technical Acceptance Criteria

- `npm run lint`
- `npm run test:run`
- `npm run build`
- Browser QA:
  - `/admin/bina` desktop overview
  - `/admin/bina` mobile overview
  - production drawer
  - finance drawer
  - sales dashboard
  - sync health dashboard
  - persistent AI assistant from multiple BINA tabs
- AI QA:
  - Ask cross-domain risk questions.
  - Ask overdue finance questions.
  - Ask supplier/work-order dependency questions.
  - Ask sales/customer summary questions.
  - Verify citations and freshness.
  - Verify refusal for secrets/arbitrary SQL.

## Expert Audit Notes

Three focused audits were run against this plan and the current repo state:

- Production readiness audit.
- UI/UX richness and adaptability audit.
- Data modeling and AI analytics correctness audit.

### Production Readiness Audit

Blocking amendments:

1. Do not ship BINA import as part of the read-only BI rollout.
   - Current import code is a write path and should be treated as a separate product.
   - Import must be feature-flagged, default to no quantity fallback, and move into a transactional DB RPC with an advisory lock on `bina_id`.
   - Required before enabling import broadly: dry-run preview, created-by audit trail, duplicate-click tests, concurrent import tests, and rollback playbook.

2. Do not deploy large JSONB expression indexes casually on production data.
   - Split view/schema migrations from index creation.
   - Use concurrent index creation or a maintenance window where required.
   - Capture row counts before deploy.
   - Run `EXPLAIN ANALYZE` on every dashboard query against production-scale data.

High-priority amendments:

- Add p95 latency budgets for BINA APIs.
- Avoid exact counts on large filtered views unless there is a proven query plan.
- Add DB statement timeouts for BINA dashboard/API queries.
- Materialize slow summaries after each BINA sync.
- Add server-enforced scopes:
  - `bina_view`
  - `finance_view`
  - `sales_log_write`
  - `ai_query`
  - `bina_import`
- Replace raw backend error messages with stable public error codes and request IDs.
- Add structured logs/metrics for route latency, DB latency, sync failures, OpenAI usage/cost, and import attempts.
- Validate finance semantics with real BINA finance users before presenting finance values as accounting truth.

Revised rollout order:

1. Deploy read-only schema/views first, with no import writes.
2. Backfill/sync BINA and validate row counts, freshness, and representative financial totals.
3. Run query plans and latency checks; materialize slow marts before exposing broadly.
4. Enable dashboard for a limited admin group with observability and alerts active.
5. Enable AI only after audit/cost/safety telemetry is verified.
6. Enable sales daily log separately.
7. Enable BINA import last, behind RBAC, feature flag, transactional RPC, and rollback playbook.

### UI/UX Richness And Adaptability Audit

Main conclusion:

- Finance is the strongest existing BINA screen.
- Most other tabs are still table-first.
- Every tab needs a dashboard layer before the drilldown table.

Screen amendments:

- `סקירה`
  - Add grouped operational queues: production delays, open purchasing, finance/collection, open deliveries, sync issues.
  - Add deltas since last sync / yesterday / current week.
  - Replace generic recommended-action rows with prioritized task cards.

- `פק״עות`
  - Add KPIs for open BINA work orders, not imported, quantity mismatch, due today/overdue, linked to Gestelit.
  - Add status split cards or compact kanban: `לא יובאו`, `פער כמות`, `בסיכון`, `מקושר`.
  - Mobile must use work-order cards with CTA.
  - Import drawer needs a preflight summary before any create action.

- `רכש`
  - Add KPIs for open request lines, open amount, received vs requested, old requests, and top blocked suppliers.
  - Separate purchase requests from goods receipts visually.
  - Add filters for supplier, flow type, open only, work order, date range.

- `ספקים`
  - Convert to supplier risk dashboard with open balance, overdue balance, oldest due date, open item count, and related purchasing volume.
  - Add top supplier cards sorted by operational risk.
  - Add supplier drawer with debts, purchase docs, goods receipts, and affected work orders.

- `כספים`
  - Visualize `summary.aging`, not just fetch it.
  - Add currency tabs or per-currency mini-summary when multiple currencies exist.
  - Use `<bdi dir="ltr">` for document numbers, invoice numbers, source table names, currency codes, and BINA IDs.
  - Consider sticky exception panel on desktop.

- `מכירות`
  - Add sales KPIs: revenue week/month, unpaid invoices, overdue receivables, invoices without work order, top customers.
  - Add invoice-to-operations drilldown: invoice -> work order -> delivery -> payment status.
  - Add explicit row actions instead of relying only on row click.

- `משלוחים`
  - Add KPIs for sent, sent-open, returned/received, unknown state, overdue returns.
  - Add timeline cards with sent date, carrier, tracking, work order, customer.
  - Add exception queue for missing tracking, old sent-open status, and missing links.

- `AI`
  - Group saved questions by domain.
  - Show answer sections: `ממצאים`, `מקורות`, `סיכון`, `המשך מומלץ`.
  - Display current context: active tab, selected entity, filters.
  - Add "apply filter from answer" actions where possible.

- `סנכרון`
  - Add freshness heatmap.
  - Add data quality checklist: stale tables, empty tables, bad encoding, partial sync failures.
  - Surface stale sync warnings in overview and domain screens.

Reusable UI components required:

- `OperationalKpiGrid`
- `DomainToolbar`
- `OperationalQueue`
- `EntityMobileCard`
- `EntityDrawer`
- `StatusBadge`
- `DataQualityBanner`
- `MetricBreakdownBar`

UI acceptance additions:

- Every BINA tab has at least 3 domain KPIs, one prioritized attention area, filters, and a drilldown path.
- No primary desktop screen is only a table.
- At 390px width, no horizontal table is required for core workflows.
- Mixed Hebrew/Latin/numeric values render correctly using `bdi`.
- Finance aging is visualized.
- Drilldown drawers show relationships, not just fields.

### Data Modeling And AI Analytics Audit

High-risk amendments:

1. Treat current sync data as potentially partial until coverage metadata exists.
   - `scripts/bina-sync.ps1` can sync `TOP ($MaxRecentOrders)`.
   - Any KPI over those landing tables may be a sample, not a complete business total.
   - Add per-table sync metadata:
     - `sync_scope`
     - `source_row_count`
     - `source_min_id`
     - `source_max_id`
     - `source_min_date`
     - `source_max_date`
     - `is_complete_snapshot`
   - Dashboard KPIs must show `partial sample` or be blocked when underlying coverage is incomplete.

2. Make currency modeling explicit and safe.
   - Normalize currency into one canonical `currency_code`.
   - Retain raw currency value for debugging.
   - Group all money metrics by `(metric, currency_code)`.
   - Do not show a single total across currencies without a dated FX table and visible conversion source.
   - Prefer `ILS` as the canonical shekel code; avoid mixing `NIS` and `ILS`.

3. Separate exact balances from inferred balances.
   - Unpaid customer invoice total is not necessarily true open receivable balance.
   - Label this as `inferred_full_invoice_balance`.
   - Exclude inferred balances from headline `open receivables` by default.
   - Add `balance_confidence` to every finance aggregate and filter.

4. Make AI evidence-bound.
   - Broad tools are useful, but cross-domain claims require deterministic links.
   - Add evidence-grade tools:
     - `get_order_risk_evidence(work_order_id)`
     - `get_supplier_evidence(supplier_code)`
     - `get_invoice_evidence(invoice_no, year)`
   - Each tool returns explicit join keys, confidence, and "not linked" reasons.

5. Upgrade AI citations.
   - Every AI tool result should include:
     - `source_view`
     - `grain`
     - `key`
     - `label`
     - `synced_at`
     - `confidence`
     - `fields_used`
   - Final answers cite evidence labels, not just table names.

Required data additions:

- `mart_bina_data_quality`
  - Bad encoding, missing keys, duplicate synthetic ids, suspicious dates, missing currency, unknown statuses, null amount/date rates, stale/empty tables.

- `mart_bina_sync_coverage`
  - Source query type, TOP limit, source total if known, last watermark, oldest/newest landed dates, aggregate-safe boolean.

- `mart_bina_finance_summary_by_currency_confidence`
  - Group by currency, direction, balance confidence, and date quality.

- `rpc_bina_overview_kpis(date_from, date_to, currency_code, require_complete_snapshot boolean)`
  - Return coverage status, sample flags, source tables, row counts, and per-currency amounts.

Business logic corrections:

- Work-order risk must exclude closed/cancelled/completed BINA statuses once those codes are mapped.
- Purchase material blockers should only include open remaining quantities, not all purchase request rows.
- Goods receipts and purchase requests should not be called a lifecycle until linked by deterministic keys.
- Supplier identity should not rely on `MAX(supplier_name)` without surfacing duplicate/renamed suppliers.
- Sales activity prioritization scores must not be treated as financial KPIs.
- Work-order reconciliation should prefer `bina_gestelit_links`; job-number matching is heuristic.
- Add line-level reconciliation between BINA production rows and Gestelit job items where possible.
- Preserve BINA local source dates separately from `timestamptz`:
  - `*_date_raw`
  - `*_date_local`
  - `date_quality_reason`

Implementation hygiene flagged by audit:

- Move any late `createServiceSupabase` import in `lib/ai/semantic-catalog.ts` to the top if still present.
- Remove duplicate imports in `lib/ai/audit.ts` if still present.

## Final Go/No-Go Gates

The BINA BI dashboard is production-ready only when:

- Coverage metadata proves which domains are complete vs sampled.
- Money KPIs are currency-safe and confidence-aware.
- Import writes are disabled or transactional and feature-flagged.
- Dashboard queries meet latency budgets on production-scale data.
- Every screen has a rich dashboard layer plus drilldown, not a table-only workflow.
- AI answers are evidence-bound, cite row-level evidence, and clearly mark inferred/missing data.
- Mobile RTL QA passes on all BINA tabs.
