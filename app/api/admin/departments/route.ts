import { NextResponse } from "next/server";
import {
  AdminActionError,
  clearDepartment,
  fetchDepartmentList,
} from "@/lib/data/admin-management";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

const respondWithError = (error: unknown) => {
  if (error instanceof AdminActionError) {
    return NextResponse.json(
      { error: error.code, details: error.details ?? error.message },
      { status: error.status },
    );
  }

  console.error("[admin-departments] unexpected", error);
  return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
};

export async function GET(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }
  try {
    const departments = await fetchDepartmentList();
    return NextResponse.json({ departments });
  } catch (error) {
    return respondWithError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as { department?: string } | null;
  if (!body?.department) {
    return NextResponse.json({ error: "INVALID_DEPARTMENT" }, { status: 400 });
  }

  const department = body.department.trim();
  if (!department) {
    return NextResponse.json({ error: "INVALID_DEPARTMENT" }, { status: 400 });
  }

  try {
    await clearDepartment(department);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respondWithError(error);
  }
}