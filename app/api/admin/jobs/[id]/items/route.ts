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

/**
 * Payload for creating job items.
 * Post Phase 5: All items are pipeline-based. Provide either:
 * - pipeline_preset_id (uses preset's stations)
 * - station_ids array (custom pipeline)
 */
type CreateJobItemPayload = {
  name: string;  // Required product name
  pipeline_preset_id?: string;
  station_ids?: string[];  // Custom station order for pipelines (alternative to preset)
  /** Map of station_id -> requires_first_product_approval (optional) */
  first_product_approval_flags?: Record<string, boolean>;
  planned_quantity: number;
  is_active?: boolean;
};

/**
 * POST /api/admin/jobs/[id]/items
 *
 * Create a new job item (pipeline-based).
 * Body: {
 *   name: string (required - product name),
 *   pipeline_preset_id?: string (loads pipeline from preset),
 *   station_ids?: string[] (custom pipeline - required if no preset),
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

  // Validate required name field
  if (!body?.name || body.name.trim() === "") {
    return NextResponse.json(
      { error: "NAME_REQUIRED", message: "name is required for job items" },
      { status: 400 },
    );
  }

  if (typeof body.planned_quantity !== "number" || body.planned_quantity <= 0) {
    return NextResponse.json(
      { error: "INVALID_QUANTITY", message: "planned_quantity must be a positive number" },
      { status: 400 },
    );
  }

  // Either preset_id OR station_ids must be provided
  if (!body.pipeline_preset_id && (!body.station_ids || body.station_ids.length === 0)) {
    return NextResponse.json(
      { error: "PIPELINE_STATIONS_REQUIRED", message: "Either pipeline_preset_id or station_ids is required" },
      { status: 400 },
    );
  }

  // Validate preset ID format if provided
  if (body.pipeline_preset_id && !isValidUUID(body.pipeline_preset_id)) {
    return NextResponse.json(
      { error: "INVALID_PRESET_ID", message: "Invalid pipeline preset ID format" },
      { status: 400 },
    );
  }

  // Validate station_ids array if provided
  if (body.station_ids && body.station_ids.length > 0) {
    const invalidStationId = body.station_ids.find(id => !isValidUUID(id));
    if (invalidStationId) {
      return NextResponse.json(
        { error: "INVALID_STATION_ID_IN_PIPELINE", message: `Invalid station ID format: ${invalidStationId}` },
        { status: 400 },
      );
    }
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
      name: body.name.trim(),
      pipeline_preset_id: body.pipeline_preset_id ?? null,
      station_ids: body.station_ids,
      first_product_approval_flags: body.first_product_approval_flags,
      planned_quantity: body.planned_quantity,
      is_active: body.is_active ?? true,
    });

    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message;
      if (message.startsWith("JOB_ITEM_") || message === "PRESET_NOT_FOUND" || message === "PRESET_HAS_NO_STEPS") {
        return NextResponse.json(
          { error: message },
          { status: 400 },
        );
      }
    }
    return createErrorResponse(error, "JOB_ITEM_CREATE_FAILED");
  }
}
