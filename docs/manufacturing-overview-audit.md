# Manufacturing overview audit and interpretation

2026-11-22. Baseline release: 95fe5fa.

## Observed problems

- The primary dashboard queried jobs only through active worker sessions. With no active sessions, it showed zero counters and empty panels while 12 saved jobs were still incomplete.
- Production progress was hidden in a collapsed chart area and presented one job at a time.
- The old active-station counter counted sessions rather than distinct stations. Custom station production statuses were omitted from its production count.
- Timing and meaning differed across widgets: session output, cumulative job progress, and live state were visually adjacent without a strong hierarchy.
- A narrow reports column clipped its controls. Job investigation required leaving the overview and finding the job again.

## Reference patterns, independently interpreted

- Tulip Operations Management Dashboard: summarize operational exceptions and connect them to actions and drilldowns. https://support.tulip.co/docs/operations-management-dashboard-1
- Tulip production management: job/station visibility in context, with connected workflows. https://tulip.co/production-management/
- Critical Manufacturing Production Order Fulfillment: compare production progress with planned expectations and make time scope explicit. https://help.criticalmanufacturing.com/11.2/userguide/business-intelligence/analytics-views/performance/production_order_fulfillment/

Gestelit uses its existing Hebrew RTL, purple accents, shadcn foundation and restrained cards. No borrowed branding or visual assets. No synthetic OEE, machine capacity, daily output or predictive bottleneck scores.

## Delivered design

- Open-work summary with clickable filters for overdue, no active session, and missing setup.
- Searchable prioritized queue; expandable per-product ordered station route with reported good/scrap quantities.
- Terminal-station progress only, capped per product so overproduction cannot mask an unfinished product. Scrap follows existing system completion semantics. Incomplete work cannot round up to 100%.
- Distinct staffed stations, station-specific status definitions, persistent live-session detail and reports.
- Contextual AI entry points, direct links to the selected job and workflow studio.
- Explicit refresh timestamp, source and lifetime scope, retry/error state retaining the last successful snapshot.

## Data boundaries

The 12 open records include older demo/test records. Seven have due dates before 2026-11-22; this is a saved-record count, not a verified current factory backlog. This release does not repair/delete these records, prove BINA historical completeness, or start any production workflow. Overview queries fail rather than silently display a result at the 1000-row safety limit. A future larger installation should use server pagination.
