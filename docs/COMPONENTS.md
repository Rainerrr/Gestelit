# React Components & Contexts

> Component library, contexts, and hooks reference
> Last updated: January 2026

---

## Table of Contents

1. [Component Organization](#1-component-organization)
2. [UI Components (shadcn/ui)](#2-ui-components-shadcnui)
3. [Worker Components](#3-worker-components)
4. [Admin Components](#4-admin-components)
5. [Form Components](#5-form-components)
6. [Layout Components](#6-layout-components)
7. [React Contexts](#7-react-contexts)
8. [Custom Hooks](#8-custom-hooks)
9. [Styling Patterns](#9-styling-patterns)

---

## 1. Component Organization

```
components/
  ui/                 # shadcn/ui base components
  worker/             # Worker-specific components
  work/               # Active work page components
  checklists/         # Checklist components
  forms/              # Form elements
  layout/             # Page structure
  navigation/         # Navigation elements
  language/           # Language switching
  theme/              # Theme management
  providers/          # Global providers
  landing/            # Landing page components

app/admin/_components/  # Admin-specific components
```

---

## 2. UI Components (shadcn/ui)

Base components from shadcn/ui with TailwindCSS styling.

### Available Components

| Component | File | Purpose |
|-----------|------|---------|
| Alert | `ui/alert.tsx` | Alert messages |
| Badge | `ui/badge.tsx` | Status badges |
| Button | `ui/button.tsx` | Action buttons |
| Calendar | `ui/calendar.tsx` | Date picker |
| Card | `ui/card.tsx` | Content cards |
| Checkbox | `ui/checkbox.tsx` | Boolean input |
| Dialog | `ui/dialog.tsx` | Modal dialogs |
| Input | `ui/input.tsx` | Text input |
| Label | `ui/label.tsx` | Form labels |
| Popover | `ui/popover.tsx` | Floating content |
| Select | `ui/select.tsx` | Dropdown select |
| Separator | `ui/separator.tsx` | Visual divider |
| Sheet | `ui/sheet.tsx` | Side panel |
| Switch | `ui/switch.tsx` | Toggle switch |
| Table | `ui/table.tsx` | Data tables |
| Textarea | `ui/textarea.tsx` | Multi-line input |
| Tooltip | `ui/tooltip.tsx` | Hover hints |

### Custom UI Components

| Component | File | Purpose |
|-----------|------|---------|
| DateRangePicker | `ui/date-range-picker.tsx` | Date range selection |
| DurationDisplay | `ui/duration-display.tsx` | Live timer |
| RtlToggle | `ui/rtl-toggle.tsx` | RTL debug toggle |

### Usage Example

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function StatusCard({ status }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Status</CardTitle>
      </CardHeader>
      <CardContent>
        <Badge style={{ backgroundColor: status.color_hex }}>
          {status.label_he}
        </Badge>
        <Button onClick={handleChange}>Change Status</Button>
      </CardContent>
    </Card>
  );
}
```

---

## 3. Worker Components

Components used in the worker-facing application.

### Station Components

| Component | File | Purpose |
|-----------|------|---------|
| StationBlock | `worker/station-block.tsx` | Station card with occupancy |
| OccupancyIndicator | `worker/occupancy-indicator.tsx` | Occupancy status badge |
| JobItemCard | `worker/job-item-card.tsx` | Job item display |
| ProductionLineStepper | `worker/production-line-stepper.tsx` | Line progress indicator |

### Work Page Components

| Component | File | Purpose |
|-----------|------|---------|
| ProductionPipeline | `work/production-pipeline.tsx` | Pipeline view |

### Checklist Components

| Component | File | Purpose |
|-----------|------|---------|
| ChecklistItems | `checklists/checklist-items.tsx` | Checklist UI |

### Example: StationBlock

```tsx
// components/worker/station-block.tsx
interface StationBlockProps {
  station: Station;
  occupancy: StationOccupancy;
  isSelected: boolean;
  onSelect: () => void;
  wipAvailable?: number;
  position?: number;
}

export function StationBlock({
  station,
  occupancy,
  isSelected,
  onSelect,
  wipAvailable,
  position
}: StationBlockProps) {
  const canSelect = !occupancy.isOccupied ||
    occupancy.occupiedByWorkerId === currentWorkerId ||
    occupancy.isInGracePeriod;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all",
        isSelected && "ring-2 ring-primary",
        !canSelect && "opacity-50 cursor-not-allowed"
      )}
      onClick={() => canSelect && onSelect()}
    >
      <CardHeader>
        <CardTitle>{station.name}</CardTitle>
        <OccupancyIndicator occupancy={occupancy} />
      </CardHeader>
      {wipAvailable !== undefined && (
        <CardContent>
          <span>WIP: {wipAvailable}</span>
        </CardContent>
      )}
    </Card>
  );
}
```

---

## 4. Admin Components

Components in `app/admin/_components/`.

### Dashboard Components

| Component | File | Purpose |
|-----------|------|---------|
| AdminDashboard | `admin-dashboard.tsx` | Main dashboard container |
| ActiveSessionsTable | `active-sessions-table.tsx` | Live sessions table |
| RecentSessionsTable | `recent-sessions-table.tsx` | Completed sessions |
| ActiveReportsWidget | `active-reports-widget.tsx` | Report badges |
| LiveJobProgress | `live-job-progress.tsx` | WIP tracking |
| KpiCards | `kpi-cards.tsx` | Statistics cards |
| ThroughputChart | `throughput-chart.tsx` | Production chart |
| StatusCharts | `status-charts.tsx` | Status distribution |

### Session Components

| Component | File | Purpose |
|-----------|------|---------|
| SessionTimeline | `session-timeline.tsx` | Status event timeline |
| VisSessionTimeline | `vis-session-timeline.tsx` | Visual timeline (vis.js) |

### History Components

| Component | File | Purpose |
|-----------|------|---------|
| HistoryDashboard | `history-dashboard.tsx` | History container |
| HistoryFilters | `history-filters.tsx` | Filter controls |
| HistoryCharts | `history-charts.tsx` | Analytics charts |
| HistoryStatistics | `history-statistics.tsx` | BI summary |

### Layout Components

| Component | File | Purpose |
|-----------|------|---------|
| AdminLayout | `admin-layout.tsx` | Page structure |
| AdminPageHeader | `admin-page-header.tsx` | Navigation header |
| ChangePasswordDialog | `change-password-dialog.tsx` | Password change |

### Utilities

| File | Purpose |
|------|---------|
| `status-dictionary.ts` | Status color/label mappings |

---

## 5. Form Components

### CreatableCombobox

```tsx
// components/forms/creatable-combobox.tsx
interface CreatableComboboxProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  onCreateNew: (value: string) => void;
  placeholder?: string;
}

export function CreatableCombobox({
  options,
  value,
  onChange,
  onCreateNew,
  placeholder
}: CreatableComboboxProps) {
  // Allows selecting existing or creating new
  return (
    <Popover>
      {/* Implementation */}
    </Popover>
  );
}
```

### FormSection

```tsx
// components/forms/form-section.tsx
interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
```

---

## 6. Layout Components

### PageHeader

```tsx
// components/layout/page-header.tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
```

### BackButton

```tsx
// components/navigation/back-button.tsx
export function BackButton({ href }: { href: string }) {
  return (
    <Link href={href}>
      <Button variant="ghost" size="sm">
        <ChevronRight className="h-4 w-4 ml-2" /> {/* RTL: arrow points left */}
        Back
      </Button>
    </Link>
  );
}
```

---

## 7. React Contexts

### WorkerSessionContext

**File:** `contexts/WorkerSessionContext.tsx`

```typescript
interface WorkerSessionContextValue {
  // Core state
  worker: Worker | null;
  session: Session | null;
  station: Station | null;
  job: Job | null;

  // Production line state
  jobItem: JobItem | null;
  jobItemStation: JobItemStation | null;

  // Session state
  currentStatus: StatusDefinition | null;
  totalGood: number;
  totalScrap: number;

  // Setters
  setWorker: (worker: Worker | null) => void;
  setSession: (session: Session | null) => void;
  setStation: (station: Station | null) => void;
  setJob: (job: Job | null) => void;
  setJobItem: (item: JobItem | null) => void;
  setJobItemStation: (station: JobItemStation | null) => void;
  setCurrentStatus: (status: StatusDefinition | null) => void;
  setTotalGood: (count: number) => void;
  setTotalScrap: (count: number) => void;

  // Actions
  clearAll: () => void;
}

export const WorkerSessionContext = createContext<WorkerSessionContextValue | null>(null);

export function useWorkerSession() {
  const context = useContext(WorkerSessionContext);
  if (!context) {
    throw new Error('useWorkerSession must be used within WorkerSessionProvider');
  }
  return context;
}
```

### PipelineContext

**File:** `contexts/PipelineContext.tsx`

```typescript
interface PipelineContextValue {
  jobItems: JobItem[];
  stationOptions: PipelineStationOption[];
  selectedStation: PipelineStationOption | null;
  loading: boolean;

  setSelectedStation: (station: PipelineStationOption | null) => void;
  refresh: () => void;
}

export const PipelineContext = createContext<PipelineContextValue | null>(null);

export function usePipeline() {
  const context = useContext(PipelineContext);
  if (!context) {
    throw new Error('usePipeline must be used within PipelineProvider');
  }
  return context;
}
```

### AdminSessionsContext

**File:** `contexts/AdminSessionsContext.tsx`

```typescript
interface AdminSessionsContextValue {
  sessions: EnrichedSession[];
  loading: boolean;
  connected: boolean;
  selectedSessionId: string | null;

  setSelectedSessionId: (id: string | null) => void;
  refresh: () => void;
}
```

### LanguageContext

**File:** `contexts/LanguageContext.tsx`

```typescript
interface LanguageContextValue {
  language: 'he' | 'ru';
  setLanguage: (lang: 'he' | 'ru') => void;
  t: (key: string) => string;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
```

---

## 8. Custom Hooks

### Worker Hooks

| Hook | File | Purpose |
|------|------|---------|
| useSessionHeartbeat | `hooks/useSessionHeartbeat.ts` | 15s heartbeat |
| useSessionBroadcast | `hooks/useSessionBroadcast.ts` | Multi-tab coordination |
| useIdleSessionCleanup | `hooks/useIdleSessionCleanup.ts` | Admin cleanup |

### Admin Hooks

| Hook | File | Purpose |
|------|------|---------|
| useAdminGuard | `hooks/useAdminGuard.ts` | Auth protection |
| useSessionTimeline | `hooks/useSessionTimeline.ts` | Timeline data |
| useScrollDirection | `hooks/useScrollDirection.ts` | Scroll detection |

### Realtime Hooks

| Hook | File | Purpose |
|------|------|---------|
| useRealtimeSession | `lib/hooks/useRealtimeSession.ts` | Session subscription |
| useRealtimeReports | `lib/hooks/useRealtimeReports.ts` | Report subscription |
| useLiveDuration | `lib/hooks/useLiveDuration.ts` | Timer display |
| useViewToggle | `lib/hooks/useViewToggle.ts` | Tab switching |

### Translation Hook

```typescript
// hooks/useTranslation.ts
export function useTranslation() {
  const { language } = useLanguage();

  const t = (key: string): string => {
    return translations[key]?.[language] || key;
  };

  return { t, language };
}
```

---

## 9. Styling Patterns

### RTL-First Design

```tsx
// Root layout sets RTL direction
<html dir="rtl">

// Use logical properties
<div className="mr-auto">  // Margin at logical "end"
<div className="text-start"> // Aligns to start (right in RTL)
```

### Status Colors

```typescript
// lib/status.ts
export const ALLOWED_STATUS_COLORS = [
  '#10b981', '#f59e0b', '#f97316', '#ef4444', '#3b82f6',
  '#8b5cf6', '#06b6d4', '#14b8a6', '#84cc16', '#eab308',
  '#ec4899', '#6366f1', '#0ea5e9', '#64748b', '#94a3b8'
];

// Usage
<Badge style={{ backgroundColor: status.color_hex }}>
  {status.label_he}
</Badge>
```

### Conditional Classes

```tsx
import { cn } from "@/lib/utils";

<Card className={cn(
  "transition-all",
  isSelected && "ring-2 ring-primary",
  isDisabled && "opacity-50 cursor-not-allowed"
)}>
```

### Responsive Design

```tsx
// Mobile-first breakpoints
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// Hide on mobile
<div className="hidden md:block">

// Stack on mobile
<div className="flex flex-col md:flex-row gap-4">
```

### Convention Rules

From CLAUDE.md:
- **No gradients, blobs, or glowing effects**
- **Neutral backgrounds with 1-2 accent colors**
- **shadcn/ui + TailwindCSS only**
- **No custom CSS frameworks**
- **Tailwind classes only, no inline styles**
