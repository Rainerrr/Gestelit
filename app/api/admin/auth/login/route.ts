import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
} from "@/lib/auth/permissions";

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

    // Password is valid
    return NextResponse.json({ success: true });
  } catch (error) {
    return createErrorResponse(error);
  }
}

