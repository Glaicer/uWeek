import { z } from "zod";
import {
  PlannerConflictError,
  PlannerInputError,
  PlannerNotFoundError,
} from "./planner";

const apiErrorCodes = [
  "invalid_request",
  "unauthorized",
  "not_found",
  "method_not_allowed",
  "conflict",
  "unsupported_media_type",
  "rate_limited",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly headers: HeadersInit | undefined;

  constructor(code: ApiErrorCode, message: string, headers?: HeadersInit) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.headers = headers;
  }
}

export const apiErrorResult = z.object({
  error: z.object({
    code: z.enum(apiErrorCodes),
    message: z.string(),
  }),
});

const statuses: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  unsupported_media_type: 415,
  rate_limited: 429,
  internal_error: 500,
};

export function apiErrorOf(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof z.ZodError)
    return new ApiError("invalid_request", "Invalid request");
  if (error instanceof PlannerInputError)
    return new ApiError("invalid_request", error.message);
  if (error instanceof PlannerNotFoundError)
    return new ApiError("not_found", "Resource not found");
  if (error instanceof PlannerConflictError)
    return new ApiError("conflict", error.message);
  return new ApiError("internal_error", "Internal server error");
}

export function apiErrorResponse(error: unknown): Response {
  const apiError = apiErrorOf(error);
  const headers = new Headers(apiError.headers);
  headers.set("Cache-Control", "no-store");
  if (apiError.code === "unauthorized")
    headers.set("WWW-Authenticate", "Bearer");
  return Response.json(
    {
      error: {
        code: apiError.code,
        message:
          apiError.code === "not_found"
            ? "Resource not found"
            : apiError.message,
      },
    },
    { status: statuses[apiError.code], headers },
  );
}
