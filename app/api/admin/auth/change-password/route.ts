import { NextResponse } from "next/server";
import {
  requireAdminPassword,
  createErrorResponse,
  UnauthorizedError,
} from "@/lib/auth/permissions";

type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export async function POST(request: Request) {
  try {
    // First verify current password
    await requireAdminPassword(request);
  } catch (error) {
    return createErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as
    | ChangePasswordPayload
    | null;

  if (!body?.currentPassword || !body.newPassword) {
    return NextResponse.json(
      { error: "MISSING_FIELDS" },
      { status: 400 },
    );
  }

  const currentAdminPassword = process.env.ADMIN_PASSWORD;
  
  if (!currentAdminPassword) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD_NOT_CONFIGURED" },
      { status: 500 },
    );
  }

  // Verify current password matches
  if (body.currentPassword !== currentAdminPassword) {
    return NextResponse.json(
      { error: "INVALID_CURRENT_PASSWORD" },
      { status: 401 },
    );
  }

  // Validate new password
  if (body.newPassword.length < 4) {
    return NextResponse.json(
      { error: "PASSWORD_TOO_SHORT", message: "Password must be at least 4 characters" },
      { status: 400 },
    );
  }

  // Note: In a production environment, you would update the ADMIN_PASSWORD
  // environment variable. However, since environment variables are typically
  // set at deployment time, this endpoint should return instructions or
  // trigger a deployment process. For now, we'll return a success response
  // with instructions.
  
  // In a real implementation, you might:
  // 1. Store the password hash in a secure database
  // 2. Use a secrets management service
  // 3. Trigger a deployment with the new password
  
  return NextResponse.json({
    success: true,
    message: "Password change request received. Please update ADMIN_PASSWORD environment variable and restart the application.",
    note: "For security, update the ADMIN_PASSWORD environment variable in your deployment configuration.",
  });
}

