import { NextResponse } from "next/server";

/**
 * Standardized API error response format
 */
export interface ApiError {
  error: string;
  code?: string;
  details?: string;
}

/**
 * Create a standardized error response for API routes
 *
 * @param error - The error message or code
 * @param status - HTTP status code (default: 500)
 * @param details - Optional additional details about the error
 * @returns NextResponse with standardized error format
 *
 * @example
 * // Simple error
 * return createApiError("NOT_FOUND", 404);
 *
 * // Error with details
 * return createApiError("VALIDATION_FAILED", 400, "Field 'name' is required");
 */
export function createApiError(
  error: string,
  status: number = 500,
  details?: string
): NextResponse<ApiError> {
  const body: ApiError = { error };
  if (details) {
    body.details = details;
  }
  return NextResponse.json(body, { status });
}

/**
 * Common HTTP status codes for API responses
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Common error codes used across the API
 */
export const ErrorCode = {
  // Authentication errors
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",

  // Validation errors
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  VALIDATION_FAILED: "VALIDATION_FAILED",

  // Resource errors
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",

  // Status definition errors
  STATUS_LABEL_HE_REQUIRED: "STATUS_LABEL_HE_REQUIRED",
  STATUS_COLOR_INVALID_NOT_ALLOWED: "STATUS_COLOR_INVALID_NOT_ALLOWED",
  STATUS_PROTECTED_GLOBAL_ONLY: "STATUS_PROTECTED_GLOBAL_ONLY",
  STATUS_MACHINE_STATE_INVALID: "STATUS_MACHINE_STATE_INVALID",
  STATUS_STATION_REQUIRED: "STATUS_STATION_REQUIRED",
  STATUS_EDIT_FORBIDDEN_PROTECTED: "STATUS_EDIT_FORBIDDEN_PROTECTED",
  STATUS_DELETE_FORBIDDEN_PROTECTED: "STATUS_DELETE_FORBIDDEN_PROTECTED",
  STATUS_NOT_FOUND: "STATUS_NOT_FOUND",

  // Session errors
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_ALREADY_ACTIVE: "SESSION_ALREADY_ACTIVE",
  SESSION_NOT_ACTIVE: "SESSION_NOT_ACTIVE",

  // Database errors
  DATABASE_ERROR: "DATABASE_ERROR",
  CREATE_FAILED: "CREATE_FAILED",
  UPDATE_FAILED: "UPDATE_FAILED",
  DELETE_FAILED: "DELETE_FAILED",

  // Server errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;
