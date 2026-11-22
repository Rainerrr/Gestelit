"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Workflow,
  Plus,
  Save,
  Search,
  ArrowLeft,
  ClipboardCheck,
  Loader2,
  Briefcase,
} from "lucide-react";
import { AdminLayout } from "../_components/admin-layout";
import { AdminPageHeader } from "../_components/admin-page-header";
import {
  PipelineFlowEditor,
  type PipelineStation,
} from "@/components/admin/pipeline-flow-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { useNotification } from "@/contexts/NotificationContext";
import {
  fetchPipelinePresetsAdminApi,
  fetchAvailableStationsForPresetAdminApi,
} from "@/lib/api/admin-management";
import type { PipelinePresetWithSteps, Station } from "@/lib/types";
import { WorkflowAgentRuns } from "@/components/admin/workflow-agent-runs";
import { JobCreationWizard } from "../manage/_components/job-creation-wizard";

const serialize = (
  name: string,
  steps: PipelineStation[],
  flags: Record<string, boolean>,
) =>
  JSON.stringify([
    name,
    steps.map((s) => [s.id, !!flags[s.id], s.agent_config ?? null]),
  ]);
export const WorkflowStudio = () => {
  const { hasAccess } = useAdminGuard();
  const { notify } = useNotification();
  const [presets, setPresets] = useState<PipelinePresetWithSteps[]>([]),
    [catalog, setCatalog] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [name, setName] = useState("");
  const [steps, setSteps] = useState<PipelineStation[]>([]),
    [flags, setFlags] = useState<Record<string, boolean>>({});
  const [baseline, setBaseline] = useState(serialize("", [], {})),
    [search, setSearch] = useState("");
  const [pendingSelection, setPendingSelection] = useState<
    PipelinePresetWithSteps | "new" | null
  >(null);
  const [jobOpen, setJobOpen] = useState(false);
  const dirty = baseline !== serialize(name, steps, flags);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([
        fetchPipelinePresetsAdminApi(),
        fetchAvailableStationsForPresetAdminApi(),
      ]);
      setPresets(p.presets);
      setCatalog(s.stations);
    } catch {
      setError("לא ניתן לטעון את התחנות והתבניות. נסו שוב.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (hasAccess) void load();
  }, [hasAccess, load]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const handleSelect = (preset: PipelinePresetWithSteps | "new") => {
    const nextSteps =
      preset === "new"
        ? []
        : [...preset.steps]
            .sort((a, b) => a.position - b.position)
            .filter((s) => s.station)
            .map((s, i) => ({
              id: s.station_id,
              station: s.station!,
              position: i + 1,
              agent_config: s.agent_config,
            }));
    const nextFlags =
      preset === "new"
        ? {}
        : Object.fromEntries(
            preset.steps
              .filter((s) => s.requires_first_product_approval)
              .map((s) => [s.station_id, true]),
          );
    const nextName = preset === "new" ? "" : preset.name;
    setSelectedId(preset === "new" ? null : preset.id);
    setName(nextName);
    setSteps(nextSteps);
    setFlags(nextFlags);
    setBaseline(serialize(nextName, nextSteps, nextFlags));
    setPendingSelection(null);
    setError(null);
  };
  const handleChoose = (preset: PipelinePresetWithSteps | "new") => {
    if (dirty) setPendingSelection(preset);
    else handleSelect(preset);
  };
  const handleSave = async () => {
    if (
      !name.trim() ||
      !steps.length ||
      steps.some((s) => !s.station.is_active)
    ) {
      setError(
        "יש להזין שם ולבחור לפחות תחנה פעילה אחת. החליפו תחנות לא פעילות לפני שמירה.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ids = steps.map((s) => s.id);
      const selectedFlags = Object.fromEntries(
        ids.filter((id) => flags[id]).map((id) => [id, true]),
      );
      const response = await fetch("/api/admin/workflows", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId,
          name: name.trim(),
          station_ids: ids,
          flags: selectedFlags,
          agents: Object.fromEntries(
            steps
              .filter((s) => s.agent_config)
              .map((s) => [s.id, s.agent_config]),
          ),
        }),
      });
      if (!response.ok) throw new Error("SAVE_FAILED");
      const { preset } = await response.json();
      setSelectedId(preset.id);
      setPresets((current) =>
        [...current.filter((p) => p.id !== preset.id), preset].sort((a, b) =>
          a.name.localeCompare(b.name, "he"),
        ),
      );
      setName(name.trim());
      setBaseline(serialize(name.trim(), steps, flags));
      notify({
        title: "התהליך נשמר",
        message: "התבנית זמינה כעת בבחירת תהליך למוצר חדש.",
        variant: "success",
      });
    } catch {
      setError(
        "לא ניתן לשמור את התהליך. השינויים נשארו במסך; בדקו את ההגדרות ונסו שוב.",
      );
    } finally {
      setSaving(false);
    }
  };
  const visible = useMemo(
    () =>
      presets.filter((p) =>
        `${p.name} ${p.steps.map((s) => s.station?.name).join(" ")}`.includes(
          search,
        ),
      ),
    [presets, search],
  );
  if (hasAccess === false) return null;
  return (
    <AdminLayout
      header={<AdminPageHeader title="תהליכי ייצור" icon={Workflow} />}
      aiContext={{
        screen: "תכנון תהליכי ייצור",
        visibleSummary: `${name || "תהליך חדש"}: ${steps.map((s) => s.station.name).join(" ← ")}`,
        activeTab: "workflows",
      }}
    >
      <div className="space-y-6 pb-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-primary">
              תכנון לפני הייצור
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">
              בונים את הדרך של כל מוצר
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              בחרו תחנות, סדרו את הרצף והגדירו אישורי מוצר ראשון וסוכני AI. שמרו
              כתבנית והשתמשו בה בעבודות חדשות.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setJobOpen(true)}
            disabled={dirty || saving || loading}
          >
            <Briefcase className="ml-2 h-4 w-4" />
            יצירת עבודה
          </Button>
        </div>
        {dirty && (
          <p className="text-xs text-muted-foreground">
            שמרו את התהליך לפני מעבר ליצירת עבודה.
          </p>
        )}
        <div className="grid min-w-0 gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">ספריית התהליכים</h3>
              <Badge variant="secondary">{presets.length}</Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => handleChoose("new")}
              disabled={saving}
            >
              <Plus className="ml-2 h-4 w-4" />
              תהליך חדש
            </Button>
            <div className="relative">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="חיפוש תהליך"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="שם תהליך או תחנה"
                className="pr-9"
              />
            </div>
            <div className="grid max-h-64 gap-2 overflow-y-auto xl:max-h-[65vh]">
              {visible.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handleChoose(p)}
                  disabled={saving}
                  aria-pressed={selectedId === p.id}
                  className={`rounded-lg border p-3 text-right transition-colors ${selectedId === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                >
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {p.steps.length} תחנות ·{" "}
                    {
                      p.steps.filter((s) => s.requires_first_product_approval)
                        .length
                    }{" "}
                    אישורים
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                    {[...p.steps]
                      .sort((a, b) => a.position - b.position)
                      .slice(0, 3)
                      .map((s) => s.station?.name)
                      .join(" ← ")}
                    {p.steps.length > 3 ? "…" : ""}
                  </span>
                </button>
              ))}
              {!loading && !visible.length && (
                <p className="py-4 text-sm text-muted-foreground">
                  {search
                    ? "לא נמצאו תהליכים לחיפוש הזה."
                    : "עדיין אין תבניות. בנו את התהליך הראשון."}
                </p>
              )}
            </div>
            <Link
              href="/admin/jobs"
              className="flex items-center gap-2 text-xs text-primary"
            >
              לעבודות ולמעקב ייצור
              <ArrowLeft className="h-3 w-3" />
            </Link>
          </aside>
          <section
            className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
            aria-label="עריכת תהליך"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium">
                {selectedId ? "עריכת תבנית" : "תהליך חדש"}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground" role="status">
                  {saving
                    ? "שומר…"
                    : dirty
                      ? "שינויים שלא נשמרו"
                      : "אין שינויים לשמירה"}
                </span>
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={
                    saving || loading || !dirty || !name.trim() || !steps.length
                  }
                >
                  {saving ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="ml-2 h-4 w-4" />
                  )}
                  שמירת תהליך
                </Button>
              </div>
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
              >
                {error}
                {!catalog.length && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void load()}
                  >
                    נסה שוב
                  </Button>
                )}
              </div>
            )}
            {loading ? (
              <p
                role="status"
                className="py-16 text-center text-sm text-muted-foreground"
              >
                טוען תחנות ותבניות…
              </p>
            ) : (
              <>
                <label className="block space-y-2 text-sm font-medium">
                  <span>שם התהליך</span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={160}
                    disabled={saving}
                    placeholder="למשל: חוברת עם כריכה ואריזה"
                  />
                </label>
                <PipelineFlowEditor
                  key={selectedId ?? "new"}
                  stations={steps}
                  onStationsChange={setSteps}
                  availableStations={catalog}
                  firstProductFlags={flags}
                  onToggleFirstProductQA={(id) =>
                    setFlags((f) => ({ ...f, [id]: !f[id] }))
                  }
                  showPresetLoader={false}
                  disabled={saving}
                  aiContext={name}
                />
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <ClipboardCheck className="h-4 w-4 shrink-0" />
                  התבנית משמשת לעבודות חדשות. שינוי בתבנית אינו משנה תהליכים של
                  מוצרים שכבר נוצרו.
                </p>
              </>
            )}
          </section>
        </div>
        <WorkflowAgentRuns refreshKey={jobOpen} />
      </div>
      <Dialog
        open={pendingSelection !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSelection(null);
        }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>לעבור בלי לשמור?</DialogTitle>
            <DialogDescription>
              יש שינויים בטיוטה הנוכחית. מעבר לתהליך אחר יבטל אותם.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingSelection(null)}
            >
              חזרה לעריכה
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (pendingSelection) handleSelect(pendingSelection);
              }}
            >
              מעבר ללא שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <JobCreationWizard
        open={jobOpen}
        onOpenChange={setJobOpen}
        onComplete={async () => {
          notify({
            title: "העבודה נוצרה",
            message: "אפשר לעקוב אחריה במסך העבודות.",
            variant: "success",
          });
        }}
      />
    </AdminLayout>
  );
};
