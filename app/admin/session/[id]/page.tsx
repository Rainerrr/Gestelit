"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, Package, AlertTriangle, Trash2, TrendingDown, Settings, Building, User, Calendar, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminLayout } from "../../_components/admin-layout";
import { VisSessionTimeline } from "../../_components/vis-session-timeline";
import { useSessionTimeline } from "@/hooks/useSessionTimeline";
import {
  getStatusColorFromDictionary,
  getStatusLabelFromDictionary,
  useStatusDictionary,
} from "../../_components/status-dictionary";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { useRealtimeSession, type ConnectionState } from "@/lib/hooks/useRealtimeSession";
import { useLiveDuration } from "@/lib/hooks/useLiveDuration";
import { SessionReportsWidget } from "./_components/session-reports-widget";
import { ProductionOverviewTable } from "./_components/production-overview-table";
import { SessionStatistics } from "./_components/session-statistics";
import type { StatusEventState, StationReason } from "@/lib/types";
import {
  calculateSessionFlags,
  hasAnyFlag,
} from "@/lib/utils/session-flags";
import {
  SESSION_FLAG_THRESHOLDS,
  SESSION_FLAG_LABELS,
} from "@/lib/config/session-flags";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ id: string }>;
};

const formatDateTime = (dateStr: string) =>
  new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateStr));

const formatTime = (dateStr: string) =>
  new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
};

const formatMinutes = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  return `${mins} דק׳`;
};

const formatProductionRate = (totalGood: number, activeTimeSeconds: number) => {
  if (activeTimeSeconds <= 0) return "0";
  const rate = totalGood / (activeTimeSeconds / 3600);
  return rate.toFixed(1);
};

// Helper to create dark-theme friendly status styles from hex color
const getStatusStyle = (hex: string) => ({
  bg: `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0.15)`,
  border: `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, 0.4)`,
  text: hex,
  dot: hex,
});

// Connection indicator component
const ConnectionIndicator = ({ state }: { state: ConnectionState }) => {
  const stateConfig = {
    connected: { color: "bg-emerald-500", pulse: true, label: "מחובר" },
    connecting: { color: "bg-amber-500", pulse: true, label: "מתחבר..." },
    disconnected: { color: "bg-amber-500", pulse: true, label: "מתחבר מחדש..." },
    error: { color: "bg-red-500", pulse: false, label: "לא מחובר" },
  };

  const config = stateConfig[state];

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          config.color,
          config.pulse && "animate-pulse"
        )}
      />
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {config.label}
      </span>
    </div>
  );
};

export default function SessionDetailPage({ params }: Props) {
  const { id: sessionId } = use(params);
  const router = useRouter();

  // Apply admin guard to check session validity and track activity
  const { hasAccess } = useAdminGuard();

  const [stationReasons, setStationReasons] = useState<StationReason[] | null>(null);
  const [isEndSessionDialogOpen, setEndSessionDialogOpen] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);

  // Use real-time session hook
  const {
    session,
    isLoading,
    isRefreshing,
    connectionState,
    error,
    refresh,
  } = useRealtimeSession({
    sessionId: hasAccess ? sessionId : null,
    enabled: hasAccess,
  });

  // Load status dictionary for this station
  const { dictionary, statuses } = useStatusDictionary(
    session?.stationId ? [session.stationId] : [],
  );

  // Fetch station_reasons for malfunction labels
  useEffect(() => {
    if (!session?.stationId) return;

    const fetchStationReasons = async () => {
      try {
        const response = await fetch(`/api/admin/stations/${session.stationId}`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setStationReasons(data.station?.station_reasons ?? null);
        }
      } catch (err) {
        console.error("[session-page] Failed to fetch station reasons", err);
      }
    };

    void fetchStationReasons();
  }, [session?.stationId]);

  // Load timeline data
  const timeline = useSessionTimeline({
    sessionId: session?.id ?? null,
    startedAt: session?.startedAt ?? null,
    endedAt: session?.endedAt ?? null,
    currentStatus: session?.currentStatus ?? null,
    stationId: session?.stationId ?? null,
    statusDefinitions: statuses,
  });

  const isActive = session?.status === "active" && !session?.endedAt;

  // Use live duration hook for active sessions
  const { seconds: liveDurationSeconds } = useLiveDuration(
    session?.startedAt ?? new Date().toISOString(),
    session?.endedAt ?? null
  );

  // Combined refresh handler that reloads both session and timeline
  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(), timeline.reload()]);
  }, [refresh, timeline]);

  // Handler to end the session
  const handleEndSession = useCallback(async () => {
    setIsEndingSession(true);
    try {
      const response = await fetch(`/api/admin/sessions/${sessionId}/end`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to end session");
      }
      setEndSessionDialogOpen(false);
      await refresh();
    } catch (err) {
      console.error("[session-page] Failed to end session:", err);
    } finally {
      setIsEndingSession(false);
    }
  }, [sessionId, refresh]);

  // Detect status changes from SSE and trigger timeline reload
  const lastStatusChangeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.lastStatusChangeAt) return;

    // Skip initial load
    if (lastStatusChangeRef.current === null) {
      lastStatusChangeRef.current = session.lastStatusChangeAt;
      return;
    }

    // Detect change and reload timeline
    if (lastStatusChangeRef.current !== session.lastStatusChangeAt) {
      lastStatusChangeRef.current = session.lastStatusChangeAt;
      void timeline.reload();
    }
  }, [session?.lastStatusChangeAt, timeline]);

  const renderStatusBadge = (status: StatusEventState | null | undefined) => {
    if (!status) {
      return (
        <Badge variant="secondary" className="border-input bg-secondary text-muted-foreground">
          ללא סטטוס
        </Badge>
      );
    }
    const statusHex = getStatusColorFromDictionary(
      status,
      dictionary,
      session?.stationId ?? undefined,
    );
    const statusStyle = getStatusStyle(statusHex);
    const statusLabel = getStatusLabelFromDictionary(
      status,
      dictionary,
      session?.stationId ?? undefined,
    );
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
        style={{
          backgroundColor: statusStyle.bg,
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: statusStyle.border,
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: statusStyle.dot }}
        />
        <span style={{ color: statusStyle.text }}>{statusLabel}</span>
      </span>
    );
  };

  // Loading state with AdminLayout
  if (isLoading) {
    return (
      <AdminLayout
        header={
          <div className="flex items-center gap-3">
            <Button onClick={() => router.back()} variant="ghost" size="sm" className="text-muted-foreground hover:bg-accent hover:text-foreground">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold text-foreground">פרטי משמרת</h1>
            </div>
          </div>
        }
      >
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
            <p className="text-sm text-muted-foreground">טוען פרטי משמרת...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Error state with AdminLayout
  if (error || !session) {
    return (
      <AdminLayout
        header={
          <div className="flex items-center gap-3">
            <Button onClick={() => router.back()} variant="ghost" size="sm" className="text-muted-foreground hover:bg-accent hover:text-foreground">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold text-foreground">פרטי משמרת</h1>
            </div>
          </div>
        }
      >
        <div className="flex min-h-[400px] items-center justify-center">
          <Card className="w-full max-w-md border-border bg-card/50">
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-primary" />
              <h2 className="mb-2 text-lg font-semibold text-foreground">שגיאה בטעינת המשמרת</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                {error === "SESSION_NOT_FOUND"
                  ? "המשמרת לא נמצאה במערכת"
                  : "אירעה שגיאה בטעינת פרטי המשמרת"}
              </p>
              <Button onClick={() => router.back()} variant="outline" className="border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground">
                <ArrowRight className="ml-2 h-4 w-4" />
                חזרה
              </Button>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      header={
        <div className="space-y-2 sm:space-y-0">
          {/* Top row: navigation + station info + actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Button onClick={() => router.back()} variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="h-5 hidden sm:block" />
            {/* Station */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Building className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="font-medium text-foreground truncate">{session.stationName}</span>
            </div>
            <Separator orientation="vertical" className="h-4 hidden sm:block" />
            {/* Worker */}
            <div className="hidden sm:flex items-center gap-1.5">
              <User className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-muted-foreground">{session.workerName}</span>
            </div>
            <Separator orientation="vertical" className="h-4 hidden md:block" />
            {/* Start date and time */}
            <div className="hidden md:flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">
                {formatDate(session.startedAt)} · {formatTime(session.startedAt)}
              </span>
            </div>
            <ConnectionIndicator state={connectionState} />
            <div className="flex-1" />
            {/* Desktop actions - hidden on mobile */}
            <div className="hidden sm:flex items-center gap-2">
              {isActive && (
                <>
                  <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                    פעילה
                  </Badge>
                  <Button
                    onClick={() => setEndSessionDialogOpen(true)}
                    variant="destructive"
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 border-0 font-medium"
                  >
                    <XCircle className="h-4 w-4 ml-1" />
                    סיום משמרת
                  </Button>
                </>
              )}
              <Button
                onClick={() => void handleRefresh()}
                variant="ghost"
                size="sm"
                disabled={isRefreshing}
                className="text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>
          </div>
          {/* Mobile actions row */}
          <div className="flex sm:hidden items-center gap-2">
            {isActive && (
              <>
                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  פעילה
                </Badge>
                <Button
                  onClick={() => setEndSessionDialogOpen(true)}
                  variant="destructive"
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 border-0 font-medium"
                >
                  <XCircle className="h-4 w-4 ml-1" />
                  סיום משמרת
                </Button>
              </>
            )}
            <div className="flex-1" />
            <Button
              onClick={() => void handleRefresh()}
              variant="ghost"
              size="sm"
              disabled={isRefreshing}
              className="text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Performance Flags Banner */}
        {(() => {
          const flags = calculateSessionFlags(session, session.stoppageTimeSeconds, session.setupTimeSeconds);
          if (!hasAnyFlag(flags)) return null;

          const activeTimeSeconds = Math.max(0, session.durationSeconds - session.stoppageTimeSeconds - session.setupTimeSeconds);

          return (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-3 flex-1">
                    <p className="text-sm font-medium text-amber-400">
                      נמצאו בעיות ביצועים בעבודה זו
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {flags.highStoppage && (
                        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          <div className="text-xs">
                            <p className="font-medium text-amber-400">{SESSION_FLAG_LABELS.high_stoppage}</p>
                            <p className="text-muted-foreground">
                              {formatMinutes(session.stoppageTimeSeconds)} (סף: {formatMinutes(SESSION_FLAG_THRESHOLDS.stoppageTimeSeconds)})
                            </p>
                          </div>
                        </div>
                      )}
                      {flags.highSetup && (
                        <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2">
                          <Settings className="h-4 w-4 text-blue-500" />
                          <div className="text-xs">
                            <p className="font-medium text-blue-400">{SESSION_FLAG_LABELS.high_setup}</p>
                            <p className="text-muted-foreground">
                              {formatMinutes(session.setupTimeSeconds)} (סף: {formatMinutes(SESSION_FLAG_THRESHOLDS.setupTimeSeconds)})
                            </p>
                          </div>
                        </div>
                      )}
                      {flags.highScrap && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                          <Trash2 className="h-4 w-4 text-red-500" />
                          <div className="text-xs">
                            <p className="font-medium text-red-400">{SESSION_FLAG_LABELS.high_scrap}</p>
                            <p className="text-muted-foreground">
                              {session.totalScrap} פסולים (סף: {SESSION_FLAG_THRESHOLDS.maxScrap})
                            </p>
                          </div>
                        </div>
                      )}
                      {flags.lowProduction && (
                        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                          <TrendingDown className="h-4 w-4 text-amber-500" />
                          <div className="text-xs">
                            <p className="font-medium text-amber-400">{SESSION_FLAG_LABELS.low_production}</p>
                            <p className="text-muted-foreground">
                              {formatProductionRate(session.totalGood, activeTimeSeconds)}/שעה (סף: {SESSION_FLAG_THRESHOLDS.minGoodPerHour})
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Session Details Card - Editorial Grid Design */}
        <Card className="border-border bg-card/50 border-r-4 border-r-primary overflow-hidden relative">
          {/* Active Indicator - Top Left */}
          {isActive && (
            <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">פעילה</span>
            </div>
          )}
          <CardContent className="p-0">
            {/* Header */}
            <div className="px-6 pt-5 pb-4">
              <h2 className="text-sm font-medium text-muted-foreground tracking-wide">
                פרטי משמרת
              </h2>
            </div>

            {/* Main Info Grid - 3 columns */}
            <div className="px-6 pb-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* Station */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">תחנה</p>
                  <p className="text-lg font-semibold text-foreground truncate" title={session.stationName}>
                    {session.stationName}
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {session.stationCode}
                  </p>
                </div>

                {/* Worker */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">עובד</p>
                  <p className="text-lg font-semibold text-foreground truncate" title={session.workerName}>
                    {session.workerName}
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {session.workerCode}
                  </p>
                </div>

                {/* Duration */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">משך זמן</p>
                  <p className="text-3xl font-bold text-foreground tabular-nums">
                    {formatDuration(isActive ? liveDurationSeconds : session.durationSeconds)}
                  </p>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Bottom Section - Times & Status */}
            <div className="px-6 py-4">
              {/* Times Row */}
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">התחלה</span>
                  <span className="text-sm font-medium text-foreground tabular-nums">
                    {formatTime(session.startedAt)}
                  </span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(session.startedAt)}
                  </span>
                </div>

                <div className="hidden sm:block text-muted-foreground/30">│</div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">סיום</span>
                  {session.endedAt ? (
                    <>
                      <span className="text-sm font-medium text-foreground tabular-nums">
                        {formatTime(session.endedAt)}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(session.endedAt)}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-emerald-500">פעילה</span>
                  )}
                </div>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap items-center gap-2">
                {session.status === "completed" && (
                  <Badge variant="secondary" className="bg-muted text-muted-foreground dark:bg-muted/50">
                    הושלמה
                  </Badge>
                )}
                {session.status === "aborted" && (
                  <Badge variant="destructive" className="bg-destructive/90 dark:bg-destructive/80">
                    בוטלה
                  </Badge>
                )}
                {renderStatusBadge(session.currentStatus)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Session Statistics */}
        <SessionStatistics
          totalGood={session.totalGood}
          totalScrap={session.totalScrap}
          durationSeconds={session.durationSeconds}
          stoppageTimeSeconds={session.stoppageTimeSeconds}
          setupTimeSeconds={session.setupTimeSeconds}
          productionPeriods={session.productionPeriods ?? []}
          isActive={isActive}
          liveDurationSeconds={liveDurationSeconds}
        />

        {/* Timeline Card */}
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <Clock className="h-5 w-5 text-muted-foreground" />
              ציר זמן סטטוסים
            </CardTitle>
          </CardHeader>
          <CardContent>
            {timeline.isLoading ? (
              <div className="flex h-[140px] items-center justify-center">
                <p className="text-sm text-muted-foreground">טוען ציר זמן...</p>
              </div>
            ) : timeline.error ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
                {timeline.error}
              </div>
            ) : (
              <VisSessionTimeline
                segments={timeline.segments}
                startTs={timeline.startTs}
                endTs={timeline.endTs}
                nowTs={timeline.nowTs}
                isActive={timeline.isActive}
                dictionary={dictionary}
                stationId={session?.stationId}
              />
            )}
          </CardContent>
        </Card>

        {/* Session Reports Widget */}
        <SessionReportsWidget
          malfunctions={session.malfunctions ?? []}
          generalReports={session.generalReports ?? []}
          scrapReports={session.scrapReports ?? []}
          stationReasons={stationReasons}
          sessionStatus={session.status}
        />

        {/* Production Overview Card */}
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <Package className="h-5 w-5 text-muted-foreground" />
              סקירת ייצור
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProductionOverviewTable productionPeriods={session.productionPeriods ?? []} />
          </CardContent>
        </Card>
      </div>

      {/* End Session Confirmation Dialog */}
      <Dialog open={isEndSessionDialogOpen} onOpenChange={setEndSessionDialogOpen}>
        <DialogContent className="border-border bg-card text-right sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">לסיים את המשמרת?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              פעולה זו תסיים את המשמרת עבור {session.workerName} בתחנה {session.stationName}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse justify-start gap-2 sm:flex-row-reverse">
            <Button
              variant="destructive"
              onClick={() => void handleEndSession()}
              disabled={isEndingSession}
              className="bg-red-600 hover:bg-red-700 border-0 font-medium"
            >
              {isEndingSession ? "מסיים..." : "כן, סיים משמרת"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setEndSessionDialogOpen(false)}
              className="border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground"
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
