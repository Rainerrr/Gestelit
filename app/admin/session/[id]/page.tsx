"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, Package, AlertTriangle } from "lucide-react";
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
import { getAdminPassword } from "@/lib/api/auth-helpers";
import type { SessionDetail } from "@/app/api/admin/dashboard/session/[id]/route";
import type { StatusEventState } from "@/lib/types";

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

export default function SessionDetailPage({ params }: Props) {
  const { id: sessionId } = use(params);
  const router = useRouter();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch session details
  useEffect(() => {
    const fetchSession = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const password = getAdminPassword();
        const response = await fetch(`/api/admin/dashboard/session/${sessionId}`, {
          headers: {
            "X-Admin-Password": password ?? "",
          },
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
  }, [sessionId]);

  // Load status dictionary for this station
  const { dictionary, statuses } = useStatusDictionary(
    session?.stationId ? [session.stationId] : [],
  );

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
