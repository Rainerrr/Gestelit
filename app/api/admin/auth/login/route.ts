import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";
import { createResponseWithSession } from "@/lib/auth/admin-session";

type LoginPayload = {
  password: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | LoginPayload
    | null;

  if (!body?.password) {
    return NextResponse.json(
      { error: "PASSWORD_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    // Create a mock request with the password to validate it
    const mockRequest = new Request(request.url, {
      method: "POST",
      headers: {
        "X-Admin-Password": body.password,
      },
    });

    // This will throw if password is invalid
    await requireAdminPassword(mockRequest);

    // Password is valid - set session cookie and return success
    return createResponseWithSession({ success: true });
  } catch (error) {
    return createErrorResponse(error);
  }
}

