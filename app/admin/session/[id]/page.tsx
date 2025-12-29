"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, Package, AlertTriangle, Trash2, TrendingDown, Settings, AlertOctagon, ChevronDown, ChevronUp, User, ZoomIn, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { VisSessionTimeline } from "../../_components/vis-session-timeline";
import { useSessionTimeline } from "@/hooks/useSessionTimeline";
import {
  getStatusBadgeFromDictionary,
  getStatusLabelFromDictionary,
  useStatusDictionary,
} from "../../_components/status-dictionary";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import type { SessionDetail, SessionMalfunctionReport } from "@/app/api/admin/dashboard/session/[id]/route";
import type { StatusEventState, StationReason } from "@/lib/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getReasonLabel } from "@/lib/data/reports";
import {
  calculateSessionFlags,
  hasAnyFlag,
} from "@/lib/utils/session-flags";
import {
  SESSION_FLAG_THRESHOLDS,
  SESSION_FLAG_LABELS,
} from "@/lib/config/session-flags";

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

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "עכשיו";
  if (diffMinutes < 60) return `לפני ${diffMinutes} דקות`;
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays === 1) return "אתמול";
  if (diffDays < 7) return `לפני ${diffDays} ימים`;

  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
};

type MalfunctionCardProps = {
  malfunction: SessionMalfunctionReport;
  stationReasons: StationReason[] | null | undefined;
};

const SessionMalfunctionCard = ({ malfunction, stationReasons }: MalfunctionCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const reasonLabel = getReasonLabel(stationReasons, malfunction.stationReasonId);

  const statusConfig = {
    open: {
      label: "חדש",
      color: "bg-red-500/10 border-red-500/30 text-red-400",
    },
    known: {
      label: "בטיפול",
      color: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    },
    solved: {
      label: "נפתר",
      color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    },
  };

  const config = statusConfig[malfunction.status];

  return (
    <div className="border border-border/60 rounded-lg bg-card/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border shrink-0 ${config.color}`}>
            <AlertOctagon className="h-3 w-3" />
            {config.label}
          </span>

          {reasonLabel && (
            <span className="text-sm text-foreground font-medium truncate">
              {reasonLabel}
            </span>
          )}

          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
            <Clock className="h-3 w-3" />
            {malfunction.createdAt ? formatRelativeTime(malfunction.createdAt) : "—"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {malfunction.imageUrl && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
              תמונה
            </Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-4 py-4 space-y-4 bg-card/20">
          {malfunction.description && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">תיאור</p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {malfunction.description}
              </p>
            </div>
          )}

          {malfunction.reporterName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              <span>דווח על ידי:</span>
              <span className="text-foreground font-medium">{malfunction.reporterName}</span>
              {malfunction.reporterCode && (
                <span className="text-xs font-mono text-muted-foreground/70">
                  ({malfunction.reporterCode})
                </span>
              )}
            </div>
          )}

          {malfunction.imageUrl && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">תמונה מצורפת</p>
              <button
                type="button"
                onClick={() => setImageOpen(true)}
                className="relative group rounded-lg overflow-hidden border border-border/60 hover:border-primary/50 transition-all"
              >
                <img
                  src={malfunction.imageUrl}
                  alt="תמונת תקלה"
                  className="max-h-48 w-auto object-contain bg-black/20"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                  <ZoomIn className="h-8 w-8 text-white drop-shadow-lg" />
                </div>
              </button>
            </div>
          )}

          {/* Link to reports management */}
          <div className="pt-2 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
            >
              <a href={`/admin/reports/malfunctions?highlight=${malfunction.id}`}>
                <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                הצג בניהול דיווחים
              </a>
            </Button>
          </div>
        </div>
      )}

      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="max-w-4xl w-auto p-0 bg-black/95 border-border overflow-hidden">
          <DialogTitle className="sr-only">תמונת תקלה</DialogTitle>
          <button
            type="button"
            onClick={() => setImageOpen(false)}
            className="absolute top-3 left-3 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          {malfunction.imageUrl && (
            <img
              src={malfunction.imageUrl}
              alt="תמונת תקלה"
              className="max-h-[85vh] max-w-full w-auto h-auto object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default function SessionDetailPage({ params }: Props) {
  const { id: sessionId } = use(params);
  const router = useRouter();

  // Apply admin guard to check session validity and track activity
  const { hasAccess } = useAdminGuard();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stationReasons, setStationReasons] = useState<StationReason[] | null>(null);

  // Fetch session details
  useEffect(() => {
    if (!hasAccess) return;

    const fetchSession = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/admin/dashboard/session/${sessionId}`, {
          credentials: "include", // Include cookies
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error ?? "SESSION_FETCH_FAILED");
        }

        const data = await response.json();
        setSession(data.session);
      } catch (err) {
        console.error("[session-page] Failed to fetch session", err);
        setError(err instanceof Error ? err.message : "UNKNOWN_ERROR");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSession();
  }, [sessionId, hasAccess]);

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
          credentials: "include", // Include cookies
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

  const renderStatusBadge = (status: StatusEventState | null | undefined) => {
    if (!status) {
      return (
        <Badge variant="secondary" className="border-input bg-secondary text-muted-foreground">
          ללא סטטוס
        </Badge>
      );
    }
    return (
      <Badge
        className={getStatusBadgeFromDictionary(
          status,
          dictionary,
          session?.stationId ?? undefined,
        )}
      >
        {getStatusLabelFromDictionary(
          status,
          dictionary,
          session?.stationId ?? undefined,
        )}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">טוען פרטי עבודה...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card className="w-full max-w-md border-border bg-card/50">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-primary" />
            <h2 className="mb-2 text-lg font-semibold text-foreground">שגיאה בטעינת העבודה</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {error === "SESSION_NOT_FOUND"
                ? "העבודה לא נמצאה במערכת"
                : "אירעה שגיאה בטעינת פרטי העבודה"}
            </p>
            <Button onClick={() => router.back()} variant="outline" className="border-input bg-secondary text-foreground/80 hover:bg-accent hover:text-foreground">
              <ArrowRight className="ml-2 h-4 w-4" />
              חזרה
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button onClick={() => router.back()} variant="ghost" size="sm" className="text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowRight className="ml-2 h-4 w-4" />
          חזרה
        </Button>
        <h1 className="text-xl font-bold text-foreground">
          עבודה #{session.jobNumber}
        </h1>
        <div className="w-[80px]" /> {/* Spacer for alignment */}
      </div>

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

      {/* Session Info Card */}
      <Card className="border-border bg-card/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-foreground">פרטי עבודה</CardTitle>
            {isActive ? (
              <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                פעילה
              </Badge>
            ) : (
              <Badge variant="secondary" className="border-input bg-secondary text-foreground/80">הושלמה</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">תחנה</p>
              <p className="font-medium text-foreground">{session.stationName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">עובד</p>
              <p className="font-medium text-foreground">{session.workerName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">סטטוס נוכחי</p>
              <div className="mt-1">{renderStatusBadge(session.currentStatus)}</div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">משך</p>
              <p className="font-medium text-foreground">
                {formatDuration(
                  isActive
                    ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000)
                    : session.durationSeconds,
                )}
              </p>
            </div>
          </div>

          <Separator className="bg-border" />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">התחלה</p>
              <p className="font-medium text-foreground">
                {formatDateTime(session.startedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">סיום</p>
              <p className="font-medium text-foreground">
                {session.endedAt ? formatDateTime(session.endedAt) : "עדיין פעילה"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* Malfunctions Card - only show if there are malfunctions */}
      {session.malfunctions && session.malfunctions.length > 0 && (
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <AlertOctagon className="h-5 w-5 text-red-500" />
              דיווחי תקלה
              <Badge variant="secondary" className="mr-2 text-xs">
                {session.malfunctions.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {session.malfunctions.map((malfunction) => (
              <SessionMalfunctionCard
                key={malfunction.id}
                malfunction={malfunction}
                stationReasons={stationReasons}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Production Stats Card */}
      <Card className="border-border bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg text-foreground">
            <Package className="h-5 w-5 text-muted-foreground" />
            תפוקה
          </CardTitle>
        </CardHeader>
        <CardContent>
          {session.totalGood > 0 || session.totalScrap > 0 || (session.plannedQuantity != null && session.plannedQuantity > 0) ? (
            <div className="space-y-4">
              <div dir="ltr" className="w-full [direction:ltr]">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={[
                      {
                        name: "תפוקה",
                        good: session.totalGood,
                        scrap: session.totalScrap,
                      },
                    ]}
                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    barCategoryGap={40}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#a1a1aa" }}
                      axisLine={{ stroke: "#3f3f46" }}
                      tickLine={false}
                    />
                    <YAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#a1a1aa" }}
                      allowDecimals={false}
                      axisLine={{ stroke: "#3f3f46" }}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                      contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid #3f3f46",
                        borderRadius: "0.5rem",
                        padding: "0.5rem 0.75rem",
                        textAlign: "right",
                        direction: "rtl",
                      }}
                      labelStyle={{ color: "#a1a1aa" }}
                      itemStyle={{ color: "#f4f4f5" }}
                      formatter={(value: number, name: string) => {
                        const label = name === "good" ? "טוב" : "פסול";
                        return [value, label];
                      }}
                    />
                    {session.plannedQuantity != null && session.plannedQuantity > 0 && (
                      <ReferenceLine
                        y={session.plannedQuantity}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        label={{
                          value: `מתוכנן: ${session.plannedQuantity}`,
                          position: "right",
                          fill: "#f59e0b",
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      />
                    )}
                    <Bar
                      dataKey="good"
                      name="טוב"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={80}
                    />
                    <Bar
                      dataKey="scrap"
                      name="פסול"
                      fill="#ef4444"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={80}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: "#10b981" }}
                  />
                  <span>טוב</span>
                  <span className="font-semibold text-foreground">{session.totalGood}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: "#ef4444" }}
                  />
                  <span>פסול</span>
                  <span className="font-semibold text-foreground">{session.totalScrap}</span>
                </div>
                {session.plannedQuantity != null && session.plannedQuantity > 0 && (
                  <div className="flex items-center gap-2">
                    <span
                      className="h-0.5 w-4 rounded-sm shrink-0"
                      style={{ backgroundColor: "#f59e0b" }}
                    />
                    <span>כמות מתוכננת</span>
                    <span className="font-semibold text-foreground">{session.plannedQuantity}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">אין נתוני תפוקה</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
