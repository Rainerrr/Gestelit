"use client";

import { useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { useWorkerSession } from "@/contexts/WorkerSessionContext";
import { fetchStationsApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { Station } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translations";

export default function StationPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { worker, station, setStation } = useWorkerSession();

  type StationsState = {
    loading: boolean;
    items: Station[];
    error: string | null;
  };

  const [state, dispatch] = useReducer(
    (
      prev: StationsState,
      action:
        | { type: "start" }
        | { type: "success"; payload: Station[] }
        | { type: "error" },
    ) => {
      switch (action.type) {
        case "start":
          return { ...prev, loading: true, error: null };
        case "success":
          return { loading: false, items: action.payload, error: null };
        case "error":
          return { ...prev, loading: false, error: "error" };
        default:
          return prev;
      }
    },
    { loading: true, items: [], error: null },
  );
  const [selectedStation, setSelectedStation] = useState<string | undefined>(
    station?.id,
  );

  useEffect(() => {
    if (!worker) {
      router.replace("/login");
      return;
    }

    let active = true;
    dispatch({ type: "start" });
    fetchStationsApi(worker.id)
      .then((result) => {
        if (!active) return;
        dispatch({ type: "success", payload: result });
      })
      .catch(() => {
        if (!active) return;
        dispatch({ type: "error" });
      });

    return () => {
      active = false;
    };
  }, [worker, router]);

  const typeLabel = (stationType: Station["station_type"]) =>
    t(`station.type.${stationType}` as TranslationKey);

  const stations = state.items;
  const selectedStationEntity = stations.find(
    (entry) => entry.id === selectedStation,
  );

  const handleContinue = () => {
    if (!selectedStation || !worker) {
      return;
    }
    const stationEntity = stations.find(
      (entry) => entry.id === selectedStation,
    );
    if (!stationEntity) {
      return;
    }
    setStation(stationEntity);
    router.push("/job");
  };

  if (!worker) {
    return null;
  }

  return (
    <>
      <PageHeader
        eyebrow={worker.full_name}
        title={t("station.title")}
        subtitle={t("station.subtitle")}
      />

      {state.loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="h-32 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80"
            >
              <div className="h-full w-full animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ))}
        </div>
      ) : state.items.length === 0 ? (
        <Card className="max-w-3xl border border-dashed text-right">
          <CardHeader>
            <CardTitle className="text-lg text-slate-700">
              {state.error ? t("station.error.load") : t("station.empty")}
            </CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stations.map((stationOption) => {
              const isSelected = selectedStation === stationOption.id;
              return (
                <button
                  key={stationOption.id}
                  type="button"
                  onClick={() => setSelectedStation(stationOption.id)}
                  className={cn(
                    "rounded-2xl border bg-white p-4 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    isSelected
                      ? "border-primary/80 bg-primary/10 shadow-lg ring-2 ring-primary/20"
                      : "border-slate-200 hover:border-primary/40 hover:shadow",
                  )}
                  aria-pressed={isSelected}
                >
                  <div className="space-y-2">
                    <p className="text-xl font-semibold text-slate-900">
                      {stationOption.name}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{typeLabel(stationOption.station_type)}</span>
                      <span
                        aria-hidden
                        className={cn(
                          "inline-flex h-2.5 w-2.5 rounded-full transition",
                          isSelected ? "bg-primary" : "bg-slate-300",
                        )}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 text-right md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm text-slate-600">
                  {selectedStationEntity
                    ? `${t("station.selected")} · ${selectedStationEntity.name}`
                    : t("station.subtitle")}
                </p>
                {selectedStationEntity ? (
                  <p className="text-xs text-slate-500">
                    {typeLabel(selectedStationEntity.station_type)}
                  </p>
                ) : null}
              </div>
              <Button
                size="lg"
                className="w-full justify-center sm:w-auto sm:min-w-48"
                disabled={!selectedStation}
                onClick={handleContinue}
              >
                {t("station.continue")}
              </Button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

