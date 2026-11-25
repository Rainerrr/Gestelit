/** Per-row sync/update times are not a watermark for a completed dataset sync. */
export function describeRowTimestamps<T extends {freshness?: unknown; latestSync?: unknown}>(data: T) {
  const {freshness: oldest, latestSync: newest, ...rest} = data;
  return {
    ...rest,
    freshness: null,
    oldestRecordTimestamp: typeof oldest === "string" ? oldest : null,
    latestRecordTimestamp: typeof newest === "string" ? newest : null,
    timestampSemantics: "Minimum and maximum timestamps among matching records. Different dates are expected for records updated at different times; they are not conflicting freshness evidence. These values do not prove a complete dataset sync or its cutoff. Do not infer missing data or stale sync from their difference.",
  };
}
