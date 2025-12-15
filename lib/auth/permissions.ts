import { NextResponse } from "next/server";
import { getWorkerFromRequest as getWorkerFromRequestContext } from "@/lib/auth/request-context";
import { createServiceSupabase } from "@/lib/supabase/client";
import type { Worker } from "@/lib/types";

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Require a worker to be authenticated
 * Throws UnauthorizedError if no worker found
 */
export async function requireWorker(
  request: Request,
  expectedWorkerId?: string,
): Promise<Worker> {
  const worker = await getWorkerFromRequestContext(request);
  
  if (!worker) {
    throw new UnauthorizedError("Worker authentication required");
  }

  if (!worker.is_active) {
    throw new ForbiddenError("Worker account is inactive");
  }

  // If expectedWorkerId is provided, verify it matches
  if (expectedWorkerId && worker.id !== expectedWorkerId) {
    throw new ForbiddenError("Worker ID mismatch");
  }

  return worker;
}

/**
 * Require admin password to be provided in request
 * Validates against ADMIN_PASSWORD environment variable
 */
export async function requireAdminPassword(request: Request): Promise<void> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    throw new Error("ADMIN_PASSWORD environment variable not configured");
  }

  // Try to get password from header
  const passwordFromHeader = request.headers.get("X-Admin-Password");
  
  if (passwordFromHeader === adminPassword) {
    return;
  }

  // Try to get password from query params (used for SSE where headers aren't available)
  try {
    const passwordFromQuery =
      new URL(request.url).searchParams.get("password") ??
      new URL(request.url).searchParams.get("adminPassword");
    if (passwordFromQuery === adminPassword) {
      return;
    }
  } catch {
    // Ignore URL parsing errors and continue to other strategies
  }

  // Try to get password from request body
  try {
    const body = await request.clone().json().catch(() => null);
    const passwordFromBody = body?.adminPassword as string | undefined;
    
    if (passwordFromBody === adminPassword) {
      return;
    }
  } catch {
    // Request body might not be JSON or already consumed
  }

  throw new UnauthorizedError("Invalid admin password");
}

/**
 * Verify that a session belongs to the authenticated worker
 */
export async function requireSessionOwnership(
  request: Request,
  sessionId: string,
): Promise<void> {
  const worker = await requireWorker(request);
  
  const supabase = createServiceSupabase();
  const { data: session, error } = await supabase
    .from("sessions")
    .select("worker_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch session: ${error.message}`);
  }

  if (!session) {
    throw new ForbiddenError("Session not found");
  }

  if (session.worker_id !== worker.id) {
    throw new ForbiddenError("Session does not belong to authenticated worker");
  }
}

/**
 * Verify that a workerId in the request matches the authenticated worker
 */
export async function requireWorkerOwnership(
  request: Request,
  workerId: string,
): Promise<void> {
  const worker = await requireWorker(request);
  
  if (worker.id !== workerId) {
    throw new ForbiddenError("Worker ID does not match authenticated worker");
  }
}

/**
 * Helper to create error responses
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage = "An error occurred",
): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: error.message },
      { status: 401 },
    );
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: error.message },
      { status: 403 },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { error: "ERROR", message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: "ERROR", message: defaultMessage },
    { status: 500 },
  );
}
