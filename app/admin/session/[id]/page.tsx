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
        <Badge variant="secondary" className="bg-slate-100 text-slate-600">
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
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
          <p className="text-sm text-slate-500">טוען פרטי עבודה...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
            <h2 className="mb-2 text-lg font-semibold">שגיאה בטעינת העבודה</h2>
            <p className="mb-4 text-sm text-slate-500">
              {error === "SESSION_NOT_FOUND"
                ? "העבודה לא נמצאה במערכת"
                : "אירעה שגיאה בטעינת פרטי העבודה"}
            </p>
            <Button onClick={() => router.back()} variant="outline">
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
        <Button onClick={() => router.back()} variant="ghost" size="sm">
          <ArrowRight className="ml-2 h-4 w-4" />
          חזרה
        </Button>
        <h1 className="text-xl font-bold text-slate-900">
          עבודה #{session.jobNumber}
        </h1>
        <div className="w-[80px]" /> {/* Spacer for alignment */}
      </div>

      {/* Session Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">פרטי עבודה</CardTitle>
            {isActive ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                פעילה
              </Badge>
            ) : (
              <Badge variant="secondary">הושלמה</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">תחנה</p>
              <p className="font-medium text-slate-900">{session.stationName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">עובד</p>
              <p className="font-medium text-slate-900">{session.workerName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">סטטוס נוכחי</p>
              <div className="mt-1">{renderStatusBadge(session.currentStatus)}</div>
            </div>
            <div>
              <p className="text-xs text-slate-500">משך</p>
              <p className="font-medium text-slate-900">
                {formatDuration(
                  isActive
                    ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000)
                    : session.durationSeconds,
                )}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">התחלה</p>
              <p className="font-medium text-slate-900">
                {formatDateTime(session.startedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">סיום</p>
              <p className="font-medium text-slate-900">
                {session.endedAt ? formatDateTime(session.endedAt) : "עדיין פעילה"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-slate-500" />
            ציר זמן סטטוסים
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.isLoading ? (
            <div className="flex h-[140px] items-center justify-center">
              <p className="text-sm text-slate-500">טוען ציר זמן...</p>
            </div>
          ) : timeline.error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-slate-500" />
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
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#475569" }}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={false}
                    />
                    <YAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#475569" }}
                      allowDecimals={false}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(15, 23, 42, 0.05)" }}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "0.5rem",
                        padding: "0.5rem 0.75rem",
                        textAlign: "right",
                        direction: "rtl",
                      }}
                      formatter={(value: number, name: string) => {
                        const label = name === "good" ? "טוב" : "פסול";
                        return [value, label];
                      }}
                    />
                    {session.plannedQuantity != null && session.plannedQuantity > 0 && (
                      <ReferenceLine
                        y={session.plannedQuantity}
                        stroke="#0f172a"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        label={{
                          value: `מתוכנן: ${session.plannedQuantity}`,
                          position: "right",
                          fill: "#0f172a",
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
              <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: "#10b981" }}
                  />
                  <span>טוב</span>
                  <span className="font-semibold text-slate-900">{session.totalGood}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: "#ef4444" }}
                  />
                  <span>פסול</span>
                  <span className="font-semibold text-slate-900">{session.totalScrap}</span>
                </div>
                {session.plannedQuantity != null && session.plannedQuantity > 0 && (
                  <div className="flex items-center gap-2">
                    <span
                      className="h-0.5 w-4 rounded-sm shrink-0"
                      style={{ backgroundColor: "#0f172a" }}
                    />
                    <span>כמות מתוכננת</span>
                    <span className="font-semibold text-slate-900">{session.plannedQuantity}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center">
              <p className="text-sm text-slate-500">אין נתוני תפוקה</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
