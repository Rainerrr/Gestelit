/**
 * Static Data Caching for Performance at Scale
 * Phase P1.2 - Cache rarely-changing data to reduce database load
 *
 * Uses Next.js unstable_cache with tag-based revalidation.
 * Cache TTL: 5 minutes for most static data.
 */

import { unstable_cache, revalidateTag } from "next/cache";
import { createServiceSupabase } from "@/lib/supabase/client";
import type {
  Station,
  StatusDefinition,
  PipelinePresetWithSteps,
} from "@/lib/types";

// Cache TTL in seconds
const CACHE_TTL = 300; // 5 minutes

/**
 * Get all status definitions (cached)
 * These rarely change - only when admin updates status configuration
 */
export const getStatusDefinitionsCached = unstable_cache(
  async (): Promise<StatusDefinition[]> => {
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("status_definitions")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("[static-cache] Failed to fetch status definitions", error);
      return [];
    }

    return (data ?? []) as StatusDefinition[];
  },
  ["status-definitions"],
  {
    revalidate: CACHE_TTL,
    tags: ["status-definitions"],
  }
);

/**
 * Get all active stations (cached)
 * Stations rarely change - only when admin adds/removes stations
 */
export const getStationsCached = unstable_cache(
  async (): Promise<Station[]> => {
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("stations")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("[static-cache] Failed to fetch stations", error);
      return [];
    }

    return (data ?? []) as Station[];
  },
  ["stations"],
  {
    revalidate: CACHE_TTL,
    tags: ["stations"],
  }
);

/**
 * Get all active pipeline presets with their steps (cached)
 * Pipeline presets change infrequently
 */
export const getPipelinePresetsCached = unstable_cache(
  async (): Promise<PipelinePresetWithSteps[]> => {
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("pipeline_presets")
      .select(`
        *,
        pipeline_preset_steps(
          id,
          station_id,
          position,
          stations(id, name, code, station_type)
        )
      `)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("[static-cache] Failed to fetch pipeline presets", error);
      return [];
    }

    // Map database field names to type interface and sort steps by position
    return (data ?? []).map((preset) => ({
      ...preset,
      steps: ((preset as { pipeline_preset_steps?: PipelinePresetWithSteps["steps"] }).pipeline_preset_steps ?? []).sort(
        (a, b) => a.position - b.position
      ),
    })) as PipelinePresetWithSteps[];
  },
  ["pipeline-presets"],
  {
    revalidate: CACHE_TTL,
    tags: ["pipeline-presets"],
  }
);

/**
 * Get station by ID (uses cached stations list)
 */
export const getStationByIdCached = async (
  stationId: string
): Promise<Station | null> => {
  const stations = await getStationsCached();
  return stations.find((s) => s.id === stationId) ?? null;
};

/**
 * Get status definition by ID (uses cached list)
 */
export const getStatusDefinitionByIdCached = async (
  statusId: string
): Promise<StatusDefinition | null> => {
  const definitions = await getStatusDefinitionsCached();
  return definitions.find((d) => d.id === statusId) ?? null;
};

// ============================================
// Cache Invalidation Functions
// ============================================

/**
 * Invalidate status definitions cache
 * Call this when admin creates/updates/deletes status definitions
 * Note: Next.js 16 requires cacheLife profile as second argument for SWR behavior
 */
export async function invalidateStatusDefinitionsCache(): Promise<void> {
  try {
    revalidateTag("status-definitions", "max");
    console.log("[static-cache] Invalidated status-definitions cache");
  } catch (error) {
    console.error("[static-cache] Failed to invalidate status-definitions", error);
  }
}

/**
 * Invalidate stations cache
 * Call this when admin creates/updates/deletes stations
 */
export async function invalidateStationsCache(): Promise<void> {
  try {
    revalidateTag("stations", "max");
    console.log("[static-cache] Invalidated stations cache");
  } catch (error) {
    console.error("[static-cache] Failed to invalidate stations", error);
  }
}

/**
 * Invalidate pipeline presets cache
 * Call this when admin creates/updates/deletes pipeline presets
 */
export async function invalidatePipelinePresetsCache(): Promise<void> {
  try {
    revalidateTag("pipeline-presets", "max");
    console.log("[static-cache] Invalidated pipeline-presets cache");
  } catch (error) {
    console.error("[static-cache] Failed to invalidate pipeline-presets", error);
  }
}

/**
 * Invalidate all static caches
 * Use sparingly - only when needed for consistency
 */
export async function invalidateAllStaticCaches(): Promise<void> {
  await Promise.all([
    invalidateStatusDefinitionsCache(),
    invalidateStationsCache(),
    invalidatePipelinePresetsCache(),
  ]);
}
