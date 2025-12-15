import { fetchWorkerByCode } from "@/lib/data/workers";
import type { Worker } from "@/lib/types";

/**
 * Extract worker code from request headers or body
 * Worker code is typically passed in the X-Worker-Code header or in the request body
 */
export async function getWorkerFromRequest(
  request: Request,
): Promise<Worker | null> {
  // Try to get worker code from header first
  const workerCodeFromHeader = request.headers.get("X-Worker-Code");
  
  if (workerCodeFromHeader) {
    return await fetchWorkerByCode(workerCodeFromHeader);
  }

  // Fallback: try to get from request body (for POST requests)
  try {
    const body = await request.clone().json().catch(() => null);
    const workerCode = body?.workerCode as string | undefined;
    
    if (workerCode) {
      return await fetchWorkerByCode(workerCode);
    }
  } catch {
    // Request body might not be JSON or already consumed
  }

  return null;
}

/**
 * Get worker ID from request body or params
 * Used when workerId is explicitly passed in the request
 */
export function getWorkerIdFromRequest(
  request: Request,
  body?: unknown,
): string | null {
  // Try from body first
  if (body && typeof body === "object" && "workerId" in body) {
    return body.workerId as string;
  }

  // Try from URL params
  const url = new URL(request.url);
  const workerId = url.searchParams.get("workerId");
  
  if (workerId) {
    return workerId;
  }

  return null;
}

