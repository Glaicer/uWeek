import { authorizeApiRequest } from "./api-access";
import { ApiError, apiErrorResponse } from "./api-errors";
import { createOpenApiDocument } from "./openapi";
import {
  createList,
  createTask,
  deleteList,
  deleteTask,
  getTask,
  listLists,
  moveList,
  queryTasks,
  renameList,
  updateTask,
} from "./planner";
import { scopeQuery } from "./planner-schemas";

const prefix = "/api/v1";
const noStore = { "Cache-Control": "no-store" };

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => Response.json(body, { status, headers: { ...noStore, ...headers } });

const empty = () => new Response(null, { status: 204, headers: noStore });

function notFound(): never {
  throw new ApiError("not_found", "Resource not found");
}

function methodNotAllowed(methods: string[]): never {
  throw new ApiError("method_not_allowed", "Method not allowed", {
    Allow: methods.join(", "),
  });
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new ApiError("invalid_request", "Invalid path");
  }
}

function segmentsOf(pathname: string): string[] {
  if (!pathname.startsWith(`${prefix}/`)) return [];
  const segments = pathname
    .slice(prefix.length + 1)
    .split("/")
    .map(decodeSegment);
  return segments.some((segment) => segment === "") ? [] : segments;
}

function queryOf(url: URL): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key in query)
      throw new ApiError("invalid_request", "Repeated query parameter");
    query[key] = value;
  }
  return query;
}

function requireEmptyQuery(query: Record<string, string>): void {
  if (Object.keys(query).length > 0)
    throw new ApiError(
      "invalid_request",
      "This operation does not accept query parameters",
    );
}

async function jsonBody(request: Request): Promise<unknown> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json")
    throw new ApiError(
      "unsupported_media_type",
      "Content-Type must be application/json",
    );
  try {
    return await request.json();
  } catch {
    throw new ApiError("invalid_request", "Invalid JSON");
  }
}

export async function handleApiRequest(
  request: Request,
  now: Date,
): Promise<Response> {
  try {
    return await dispatch(request, now);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function dispatch(request: Request, now: Date): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === `${prefix}/openapi.json`) {
    if (request.method !== "GET" && request.method !== "HEAD")
      methodNotAllowed(["GET", "HEAD"]);
    return Response.json(createOpenApiDocument());
  }

  const { userId } = await authorizeApiRequest(request);
  const segments = segmentsOf(url.pathname);
  const query = queryOf(url);
  const method = request.method === "HEAD" ? "GET" : request.method;

  if (segments[0] === "tasks") {
    if (segments.length === 1) {
      if (method === "GET") return json(await queryTasks(userId, query, now));
      if (method === "POST") {
        requireEmptyQuery(query);
        const task = await createTask(userId, await jsonBody(request));
        return json(task, 201, { Location: `${prefix}/tasks/${task.id}` });
      }
      methodNotAllowed(["GET", "HEAD", "POST"]);
    }

    const id = segments[1];
    if (segments.length === 2) {
      if (method === "GET") {
        requireEmptyQuery(query);
        return json(await getTask(userId, id, now));
      }
      if (method === "PATCH") {
        const task = await updateTask(
          userId,
          id,
          await jsonBody(request),
          scopeQuery.parse(query).scope,
        );
        return json(task);
      }
      if (method === "DELETE") {
        await deleteTask(userId, id, scopeQuery.parse(query).scope);
        return empty();
      }
      methodNotAllowed(["GET", "HEAD", "PATCH", "DELETE"]);
    }

    if (segments.length === 3) {
      const action = segments[2];
      if (action === "complete" || action === "uncomplete") {
        if (method !== "POST") methodNotAllowed(["POST"]);
        requireEmptyQuery(query);
        return json(
          await updateTask(userId, id, { completed: action === "complete" }),
        );
      }
      if (action === "move") {
        if (method !== "POST") methodNotAllowed(["POST"]);
        requireEmptyQuery(query);
        return json(
          await updateTask(userId, id, { placement: await jsonBody(request) }),
        );
      }
    }
  }

  if (segments[0] === "lists") {
    if (segments.length === 1) {
      if (method === "GET") {
        requireEmptyQuery(query);
        return json(await listLists(userId));
      }
      if (method === "POST") {
        requireEmptyQuery(query);
        const list = await createList(userId, await jsonBody(request));
        return json(list, 201);
      }
      methodNotAllowed(["GET", "HEAD", "POST"]);
    }

    const id = segments[1];
    if (segments.length === 2) {
      if (method === "PATCH") {
        requireEmptyQuery(query);
        return json(await renameList(userId, id, await jsonBody(request)));
      }
      if (method === "DELETE") {
        requireEmptyQuery(query);
        await deleteList(userId, id);
        return empty();
      }
      methodNotAllowed(["PATCH", "DELETE"]);
    }

    if (segments.length === 3 && segments[2] === "move") {
      if (method !== "POST") methodNotAllowed(["POST"]);
      requireEmptyQuery(query);
      await moveList(userId, id, await jsonBody(request));
      return empty();
    }
  }

  notFound();
}
