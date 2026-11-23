export type UpsertError = { message: string; code?: string };
/** Keep statement work bounded; timeout retries are idempotent upserts of the
 * same stable BINA IDs. Preserve honest partial counts if a later batch fails. */
export async function upsertBinaBatches<T>(rows: T[], write: (batch: T[]) => PromiseLike<{ error: UpsertError | null }>) {
  let upserted = 0;
  async function batch(values: T[]): Promise<UpsertError | null> {
    const { error } = await write(values);
    if (!error) { upserted += values.length; return null; }
    if ((error.code === "57014" || /statement timeout/i.test(error.message)) && values.length > 25) {
      const middle = Math.ceil(values.length / 2);
      return await batch(values.slice(0, middle)) ?? await batch(values.slice(middle));
    }
    return error;
  }
  for (let offset = 0; offset < rows.length; offset += 100) {
    const error = await batch(rows.slice(offset, offset + 100));
    if (error) return { upserted, error };
  }
  return { upserted, error: null };
}
