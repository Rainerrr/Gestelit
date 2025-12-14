import { useEffect, useMemo, useState } from "react";
import {
  buildStatusDictionary,
  getStatusBadgeClass,
  getStatusHex,
  getStatusLabel,
  getStatusScope,
} from "@/lib/status";
import { fetchStatusDefinitionsAdminApi } from "@/lib/api/admin-management";
import type { StatusDefinition } from "@/lib/types";

export type StatusDictionaryState = {
  statuses: StatusDefinition[];
  isLoading: boolean;
  error: string | null;
};

export const useStatusDictionary = (stationIds: string[] = []) => {
  const stationKey = stationIds.join(",");
  const [state, setState] = useState<StatusDictionaryState>({
    statuses: [],
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const response = await fetchStatusDefinitionsAdminApi(
          stationIds.length ? { stationIds } : undefined,
        );
        if (!active) return;
        setState({
          statuses: response.statuses ?? [],
          isLoading: false,
          error: null,
        });
      } catch (error) {
        if (!active) return;
        setState({
          statuses: [],
          isLoading: false,
          error: error instanceof Error ? error.message : "STATUS_FETCH_FAILED",
        });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [stationKey, stationIds]);

  const dictionary = useMemo(
    () => buildStatusDictionary(state.statuses),
    [state.statuses],
  );

  return {
    ...state,
    dictionary,
  };
};

export const getStatusLabelFromDictionary = (
  id: string,
  dictionary: ReturnType<typeof buildStatusDictionary>,
  stationId?: string | null,
) => getStatusLabel(id, dictionary, stationId);

export const getStatusColorFromDictionary = (
  id: string,
  dictionary: ReturnType<typeof buildStatusDictionary>,
  stationId?: string | null,
) => getStatusHex(id, dictionary, stationId);

export const getStatusBadgeFromDictionary = (
  id: string,
  dictionary: ReturnType<typeof buildStatusDictionary>,
  stationId?: string | null,
) => getStatusBadgeClass(id, dictionary, stationId);

export const getStatusOrderFromDictionary = (
  dictionary: ReturnType<typeof buildStatusDictionary>,
  fallback: string[] = [],
) => (dictionary.order.length ? dictionary.order : Array.from(new Set(fallback)));

export const getStatusScopeFromDictionary = (
  id: string,
  dictionary: ReturnType<typeof buildStatusDictionary>,
) => getStatusScope(id, dictionary);
