import { NextResponse } from "next/server";
import {
  fetchJobItemsForJob,
  createJobItem,
} from "@/lib/data/job-items";
import { getJobById } from "@/lib/data/jobs";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { isValidUUID } from "@/lib/utils/validation";
import type { JobItemKind } from "@/lib/types";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/admin/jobs/[id]/items
 *
 * Returns all job items for a job with stations and progress.
 * Query params:
 * - includeInactive: "true" to include inactive items
 * - includeWipBalances: "true" to include WIP balances for each station
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id: jobId } = await params;

  // Validate job ID format
  if (!isValidUUID(jobId)) {
    return NextResponse.json(
      { error: "INVALID_JOB_ID", message: "Invalid job ID format" },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";
  const includeWipBalances = searchParams.get("includeWipBalances") === "true";

  try {
    // Verify job exists
    const job = await getJobById(jobId);
    if (!job) {
      return NextResponse.json(
        { error: "JOB_NOT_FOUND" },
        { status: 404 },
      );
    }

    const items = await fetchJobItemsForJob(jobId, {
      includeStations: true,
      includeProgress: true,
      includeInactive,
      includeWipBalances,
    });
    return NextResponse.json({ items });
  } catch (error) {
    return createErrorResponse(error, "JOB_ITEMS_FETCH_FAILED");
  }
}

type CreateJobItemPayload = {
  kind: JobItemKind;
  station_id?: string;
  production_line_id?: string;
  planned_quantity: number;
  is_active?: boolean;
};

/**
 * POST /api/admin/jobs/[id]/items
 *
 * Create a new job item.
 * Body: {
 *   kind: "station" | "line",
 *   station_id?: string (required if kind="station"),
 *   production_line_id?: string (required if kind="line"),
 *   planned_quantity: number,
 *   is_active?: boolean
 * }
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { id: jobId } = await params;

  // Validate job ID format
  if (!isValidUUID(jobId)) {
    return NextResponse.json(
      { error: "INVALID_JOB_ID", message: "Invalid job ID format" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as CreateJobItemPayload | null;

  // Validate required fields
  if (!body?.kind || !["station", "line"].includes(body.kind)) {
    return NextResponse.json(
      { error: "INVALID_KIND", message: "kind must be 'station' or 'line'" },
      { status: 400 },
    );
  }

  if (typeof body.planned_quantity !== "number" || body.planned_quantity <= 0) {
    return NextResponse.json(
      { error: "INVALID_QUANTITY", message: "planned_quantity must be a positive number" },
      { status: 400 },
    );
  }

  // Validate XOR constraint
  if (body.kind === "station" && !body.station_id) {
    return NextResponse.json(
      { error: "STATION_ID_REQUIRED", message: "station_id is required for kind='station'" },
      { status: 400 },
    );
  }

  if (body.kind === "line" && !body.production_line_id) {
    return NextResponse.json(
      { error: "LINE_ID_REQUIRED", message: "production_line_id is required for kind='line'" },
      { status: 400 },
    );
  }

  // Validate station_id or production_line_id format
  if (body.kind === "station" && !isValidUUID(body.station_id)) {
    return NextResponse.json(
      { error: "INVALID_STATION_ID", message: "Invalid station ID format" },
      { status: 400 },
    );
  }

  if (body.kind === "line" && !isValidUUID(body.production_line_id)) {
    return NextResponse.json(
      { error: "INVALID_LINE_ID", message: "Invalid production line ID format" },
      { status: 400 },
    );
  }

  try {
    // Verify job exists
    const job = await getJobById(jobId);
    if (!job) {
      return NextResponse.json(
        { error: "JOB_NOT_FOUND" },
        { status: 404 },
      );
    }

    const item = await createJobItem({
      job_id: jobId,
      kind: body.kind,
      station_id: body.kind === "station" ? body.station_id : null,
      production_line_id: body.kind === "line" ? body.production_line_id : null,
      planned_quantity: body.planned_quantity,
      is_active: body.is_active ?? true,
    });

    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message;
      if (message.startsWith("JOB_ITEM_")) {
        return NextResponse.json(
          { error: message },
          { status: 400 },
        );
      }
    }
    return createErrorResponse(error, "JOB_ITEM_CREATE_FAILED");
  }
}
