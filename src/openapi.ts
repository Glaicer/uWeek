import { z } from "zod";
import { createDocument } from "zod-openapi";
import { apiErrorResult } from "./api-errors";
import {
  completionFields,
  edits,
  isoDate,
  listId,
  listMove,
  listResult,
  newList,
  newTask,
  placement,
  scopeQuery,
  taskId,
  taskResult,
} from "./planner-schemas";

const json = (schema: z.ZodType) => ({
  "application/json": { schema },
});

const errorResponse = (description: string) => ({
  description,
  content: json(apiErrorResult),
});

const errors = {
  invalid: errorResponse("The request is invalid"),
  unauthorized: {
    ...errorResponse("Missing, invalid or revoked bearer token"),
    headers: {
      "WWW-Authenticate": {
        description: "Bearer",
        schema: { type: "string" as const },
      },
    },
  },
  notFound: errorResponse("Resource not found"),
  conflict: errorResponse("The request conflicts with existing data"),
  media: errorResponse("Content-Type must be application/json"),
  rateLimited: {
    ...errorResponse("Rate limit exceeded"),
    headers: {
      "Retry-After": {
        description: "Seconds to wait before the next request",
        schema: { type: "integer" as const, minimum: 1 },
      },
    },
  },
  internal: errorResponse("Internal server error"),
};

const guarded = {
  "401": errors.unauthorized,
  "429": errors.rateLimited,
  "500": errors.internal,
};

const taskParameters = z.object({ id: taskId });
const listParameters = z.object({ id: listId });

// why: requestParams needs a ZodObject, so the cross-field rules live in the description
const taskQueryParameters = z.strictObject({
  from: isoDate.optional(),
  to: isoDate.optional(),
  listId: listId.optional(),
  ...completionFields,
});

export function createOpenApiDocument(): ReturnType<typeof createDocument> {
  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "uWeek API",
      version: "1.0.0",
      description: [
        "Tasks, lists and their occurrences for one uWeek account.",
        'Authenticate every protected request with `Authorization: Bearer <token>`. API tokens are managed on the "API tokens" settings page and can be revoked at any time.',
        "Calendar dates are `YYYY-MM-DD` in the token owner's time zone. A date range is inclusive and may span at most 366 days. Repeating tasks appear as virtual occurrences with an id of the form `<seriesId>_<date>`.",
        "Each token may make 120 requests per minute. A limited response is `429` with the number of seconds in the `Retry-After` header.",
        "Errors share one shape: `{ error: { code, message } }`.",
      ].join("\n\n"),
    },
    servers: [{ url: "/api/v1" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "API token created on the API tokens settings page.",
        },
      },
    },
    paths: {
      "/tasks": {
        get: {
          summary: "List tasks",
          description:
            "Pass either `from` and `to` together or `listId`, never both. A range is inclusive and may span at most 366 days. `completed` filters by completion and `q` matches the title or notes literally, case-insensitively.",
          requestParams: { query: taskQueryParameters },
          responses: {
            "200": {
              description: "Stored tasks and virtual occurrences in order",
              content: json(z.array(taskResult)),
            },
            "400": errors.invalid,
            ...guarded,
          },
        },
        post: {
          summary: "Create a task",
          requestBody: { content: json(newTask) },
          responses: {
            "201": {
              description: "The created task",
              headers: {
                Location: {
                  description: "URL of the created task",
                  schema: { type: "string" as const },
                },
              },
              content: json(taskResult),
            },
            "400": errors.invalid,
            "404": errors.notFound,
            "409": errors.conflict,
            "415": errors.media,
            ...guarded,
          },
        },
      },
      "/tasks/{id}": {
        get: {
          summary: "Read a task",
          requestParams: { path: taskParameters },
          responses: {
            "200": {
              description: "The task",
              content: json(taskResult),
            },
            "400": errors.invalid,
            "404": errors.notFound,
            ...guarded,
          },
        },
        patch: {
          summary: "Edit a task",
          description:
            "`scope` is `this` (default) or `following`: following applies the edit to this and all later occurrences and splits the series.",
          requestParams: { path: taskParameters, query: scopeQuery },
          requestBody: { content: json(edits) },
          responses: {
            "200": {
              description: "The updated task",
              content: json(taskResult),
            },
            "400": errors.invalid,
            "404": errors.notFound,
            "409": errors.conflict,
            "415": errors.media,
            ...guarded,
          },
        },
        delete: {
          summary: "Delete a task",
          description:
            "`scope` is `this` (default) or `following`. Deleting one occurrence of a series keeps it from coming back.",
          requestParams: { path: taskParameters, query: scopeQuery },
          responses: {
            "204": { description: "Deleted" },
            "400": errors.invalid,
            "404": errors.notFound,
            ...guarded,
          },
        },
      },
      "/tasks/{id}/complete": {
        post: {
          summary: "Complete a task",
          description: "Completes this occurrence only.",
          requestParams: { path: taskParameters },
          responses: {
            "200": {
              description: "The completed task",
              content: json(taskResult),
            },
            "400": errors.invalid,
            "404": errors.notFound,
            ...guarded,
          },
        },
      },
      "/tasks/{id}/uncomplete": {
        post: {
          summary: "Uncomplete a task",
          description: "Uncompletes this occurrence only.",
          requestParams: { path: taskParameters },
          responses: {
            "200": {
              description: "The uncompleted task",
              content: json(taskResult),
            },
            "400": errors.invalid,
            "404": errors.notFound,
            ...guarded,
          },
        },
      },
      "/tasks/{id}/move": {
        post: {
          summary: "Move a task",
          description:
            "Moves this occurrence to a date or list, optionally at an index.",
          requestParams: { path: taskParameters },
          requestBody: { content: json(placement) },
          responses: {
            "200": {
              description: "The moved task",
              content: json(taskResult),
            },
            "400": errors.invalid,
            "404": errors.notFound,
            "409": errors.conflict,
            "415": errors.media,
            ...guarded,
          },
        },
      },
      "/lists": {
        get: {
          summary: "List lists",
          responses: {
            "200": {
              description: "The account's lists in order",
              content: json(z.array(listResult)),
            },
            ...guarded,
          },
        },
        post: {
          summary: "Create a list",
          requestBody: { content: json(newList) },
          responses: {
            "201": {
              description: "The created list",
              content: json(listResult),
            },
            "400": errors.invalid,
            "415": errors.media,
            ...guarded,
          },
        },
      },
      "/lists/{id}": {
        patch: {
          summary: "Rename a list",
          requestParams: { path: listParameters },
          requestBody: { content: json(newList) },
          responses: {
            "200": {
              description: "The renamed list",
              content: json(listResult),
            },
            "400": errors.invalid,
            "404": errors.notFound,
            "415": errors.media,
            ...guarded,
          },
        },
        delete: {
          summary: "Delete a list",
          description: "The last remaining list cannot be deleted.",
          requestParams: { path: listParameters },
          responses: {
            "204": { description: "Deleted" },
            "400": errors.invalid,
            "404": errors.notFound,
            "409": errors.conflict,
            ...guarded,
          },
        },
      },
      "/lists/{id}/move": {
        post: {
          summary: "Move a list",
          requestParams: { path: listParameters },
          requestBody: { content: json(listMove) },
          responses: {
            "204": { description: "Moved" },
            "400": errors.invalid,
            "404": errors.notFound,
            "415": errors.media,
            ...guarded,
          },
        },
      },
    },
  });
}
