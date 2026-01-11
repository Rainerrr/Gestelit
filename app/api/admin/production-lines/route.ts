import { NextResponse } from "next/server";
import {
  fetchAllProductionLines,
  createProductionLine,
} from "@/lib/data/production-lines";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

/**
 * GET /api/admin/production-lines
 *
 * Returns all production lines with their stations.
 * Query params:
 * - includeInactive: "true" to include inactive lines
 */
export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  try {
    const lines = await fetchAllProductionLines({
      includeInactive,
      includeStations: true,
    });
    return NextResponse.json({ lines });
  } catch (error) {
    return createErrorResponse(error, "PRODUCTION_LINES_FETCH_FAILED");
  }
}

/**
 * POST /api/admin/production-lines
 *
 * Create a new production line.
 * Body: { name: string, code?: string, is_active?: boolean }
 */
export async function POST(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = await request.json().catch(() => null);

  if (!body?.name?.trim()) {
    return NextResponse.json(
      { error: "NAME_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    const line = await createProductionLine({
      name: body.name.trim(),
      code: body.code ?? null,
      is_active: body.is_active ?? true,
    });
    return NextResponse.json({ line });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PRODUCTION_LINE_CODE_EXISTS") {
        return NextResponse.json(
          { error: "CODE_ALREADY_EXISTS" },
          { status: 400 },
        );
      }
    }
    return createErrorResponse(error, "PRODUCTION_LINE_CREATE_FAILED");
  }
}
