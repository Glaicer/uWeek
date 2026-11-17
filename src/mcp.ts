import {
  createMcpHandler,
  McpServer,
  type AuthInfo,
  type CallToolResult,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { authorizeApiRequest } from "./api-access";
import { apiErrorOf, apiErrorResponse } from "./api-errors";
import {
  createTask,
  deleteTask,
  listLists,
  PlannerNotFoundError,
  queryTasks,
  readWeek,
  searchTasks,
  type Task,
  updateTask,
} from "./planner";
import {
  completionFields,
  edits,
  isoDate,
  listId,
  newTask,
  placement,
  scope,
  searchQuery,
  taskId,
  taskQuery,
  title,
} from "./planner-schemas";

interface Caller {
  userId: string;
  now: Date;
}

const datesNote =
  'Dates are calendar dates in YYYY-MM-DD format. "Today" is the current date in the user\'s time zone (list_week returns today and timeZone), not UTC. On reads, unfinished tasks from past days have already been moved to today.';

const idNote =
  'Task ids come from list_week or list_tasks. An occurrence of a repeating task has an id like <uuid>_<YYYY-MM-DD>; scope "following" covers this occurrence and all later ones.';

function callerOf(authInfo: AuthInfo | undefined): Caller {
  const userId = authInfo?.extra?.userId;
  const now = authInfo?.extra?.now;
  if (typeof userId !== "string" || !(now instanceof Date))
    throw new Error("MCP request without a caller");
  return { userId, now };
}

async function requireTask(task: Promise<Task | null>): Promise<Task> {
  const found = await task;
  if (!found) throw new PlannerNotFoundError();
  return found;
}

// why: tool schemas stay flat z.object — Claude rejects a top-level oneOf, so planner unions are parsed inside callbacks
function plannerServer(caller: Caller): McpServer {
  const server = new McpServer(
    { name: "yourweek", version: "1.0.0" },
    { instructions: datesNote },
  );

  server.registerTool(
    "list_week",
    {
      description: `Read one planner week: its dates, lists and tasks, including repeating occurrences. Without week, the week containing today is read; week is any date in the wanted week. ${datesNote}`,
      inputSchema: z.object({
        week: isoDate
          .optional()
          .describe("Any date (YYYY-MM-DD) in the week to read."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ week }) =>
      run(() => readWeek(caller.userId, { week }, caller.now)),
  );

  server.registerTool(
    "list_tasks",
    {
      description: `Read tasks for a date range or for one list. Pass from and to (inclusive, a range of at most 366 days) or listId, exactly one of them. completed filters by status, text by title or notes. ${datesNote}`,
      inputSchema: z.object({
        from: isoDate.optional().describe("First date, inclusive."),
        to: isoDate.optional().describe("Last date, inclusive."),
        listId: listId.optional().describe("Read only this list."),
        completed: z
          .boolean()
          .optional()
          .describe("true for completed tasks, false for open ones."),
        text: completionFields.q.describe(
          "Filter by text in the task title or notes.",
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const { completed, text, ...where } = args;
      return run(() =>
        queryTasks(
          caller.userId,
          taskQuery.parse({
            ...where,
            ...(completed !== undefined && { completed: String(completed) }),
            ...(text !== undefined && { q: text }),
          }),
          caller.now,
        ),
      );
    },
  );

  server.registerTool(
    "list_lists",
    {
      description: "List the user's lists with their ids and titles.",
      annotations: { readOnlyHint: true },
    },
    async () => run(() => listLists(caller.userId)),
  );

  server.registerTool(
    "search_tasks",
    {
      description:
        "Search task titles and notes. A repeating task appears once with repeats: true and its series id — use list_tasks for the id of one occurrence. nextCursor continues to the next page.",
      inputSchema: z.object({
        query: searchQuery.shape.query.describe(
          "Text to find in titles and notes.",
        ),
        cursor: searchQuery.shape.cursor.describe(
          "nextCursor from the previous page; omit for the first page.",
        ),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => run(() => searchTasks(caller.userId, args)),
  );

  server.registerTool(
    "create_task",
    {
      description: `Create a task. Pass exactly one of date or listId: date puts it on a day, listId into a list. ${datesNote}`,
      inputSchema: z.object({
        title: title.describe("Task title."),
        date: isoDate.optional().describe("Day to place the task on."),
        listId: listId.optional().describe("List to place the task in."),
      }),
    },
    async (args) => run(() => createTask(caller.userId, newTask.parse(args))),
  );

  server.registerTool(
    "update_task",
    {
      description: `Change a task's fields. checklist replaces the whole checklist; completed: false unchecks it; repeat: null stops the series. ${idNote} ${datesNote}`,
      inputSchema: z.object({
        id: taskId.describe("Task id."),
        scope: scope
          .default("this")
          .describe(
            'Use "following" to apply the change to this and all later occurrences.',
          ),
        ...edits.shape,
      }),
    },
    async (args) => {
      const { id, scope: inScope, ...changes } = args;
      return run(() =>
        requireTask(updateTask(caller.userId, id, changes, inScope)),
      );
    },
  );

  server.registerTool(
    "move_task",
    {
      description: `Move a task to date or listId, exactly one of them, and optionally to index within that day or list (0 is first). ${datesNote} ${idNote}`,
      inputSchema: z.object({
        id: taskId.describe("Task id."),
        date: isoDate.optional().describe("Day to move the task to."),
        listId: listId.optional().describe("List to move the task to."),
        index: z
          .int()
          .min(0)
          .optional()
          .describe("Position within the day or list, 0 is first."),
      }),
    },
    async (args) => {
      const { id, ...to } = args;
      return run(() =>
        requireTask(
          updateTask(caller.userId, id, { placement: placement.parse(to) }),
        ),
      );
    },
  );

  server.registerTool(
    "complete_task",
    {
      description: `Mark a task completed; use update_task with completed: false to undo it. ${idNote}`,
      inputSchema: z.object({ id: taskId.describe("Task id.") }),
    },
    async ({ id }) =>
      run(() =>
        requireTask(updateTask(caller.userId, id, { completed: true })),
      ),
  );

  server.registerTool(
    "delete_task",
    {
      description: `Delete a task. ${idNote}`,
      inputSchema: z.object({
        id: taskId.describe("Task id."),
        scope: scope
          .default("this")
          .describe(
            'Use "following" to delete this and all later occurrences.',
          ),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ id, scope: inScope }) =>
      run(async () => {
        if (!(await deleteTask(caller.userId, id, inScope)))
          throw new PlannerNotFoundError();
        return { id, deleted: true };
      }),
  );

  return server;
}

async function run(action: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const value = await action();
    return { content: [{ type: "text", text: JSON.stringify(value) }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text:
            error instanceof z.ZodError
              ? z.prettifyError(error)
              : apiErrorOf(error).message,
        },
      ],
      isError: true,
    };
  }
}

const handler = createMcpHandler(({ authInfo }) =>
  plannerServer(callerOf(authInfo)),
);

export async function handleMcpRequest(
  request: Request,
  now: Date,
): Promise<Response> {
  let principal;
  try {
    principal = await authorizeApiRequest(request);
  } catch (error) {
    return apiErrorResponse(error);
  }
  return handler.fetch(request, {
    authInfo: {
      token: principal.token,
      clientId: principal.tokenId,
      scopes: [],
      extra: { userId: principal.userId, now },
    },
  });
}
