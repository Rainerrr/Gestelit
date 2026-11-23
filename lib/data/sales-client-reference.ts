/** Next page params may still contain an encoded colon; normalize once before
 * the API client encodes the path, otherwise valid customer links become %253A. */
export function normalizeSalesClientRef(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return /^(bina:\d+|local:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(decoded) ? decoded : null;
  } catch { return null; }
}
