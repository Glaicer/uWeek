import {
  createMcpHandler,
  McpServer,
  type AuthInfo,
  type CallToolResult,
  type StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { authorizeApiRequest } from "./api-access";
import { apiErrorOf, apiErrorResponse } from "./api-errors";
import {
  createTask,
  deleteTask,
  listLists,
  queryTasks,
  readWeek,
  searchTasks,
  updateTask,
} from "./planner";
import {
  completionFields,
  edits,
  isoDate,
  listId,
  placement,
  scope,
  searchQuery,
  taskId,
  title,
} from "./planner-schemas";

interface Caller {
  userId: string;
  now: Date;
}

const datesNote =
  'Dates are calendar dates in YYYY-MM-DD format. "Today" is the current date in the user\'s time zone (list_week returns today and timeZone), not UTC. On reads, unfinished tasks from past days have already been moved to today.';

const dateFormat =
  'Dates are YYYY-MM-DD; "today" is in the user\'s time zone, as list_week reports.';

const serverInstructions = `uWeek is the user's weekly planner: tasks placed on days of the week or kept in lists. Use these tools to read the week, tasks and lists, search tasks, and create, update, move, complete or delete tasks. ${datesNote}`;

const idNote =
  'Task ids come from list_week or list_tasks. An occurrence of a repeating task has an id like <uuid>_<YYYY-MM-DD>; scope "following" covers this occurrence and all later ones.';

function callerOf(authInfo: AuthInfo | undefined): Caller {
  const userId = authInfo?.extra?.userId;
  const now = authInfo?.extra?.now;
  if (typeof userId !== "string" || !(now instanceof Date))
    throw new Error("MCP request without a caller");
  return { userId, now };
}

// why: zod writes its whole UUID regex into every id field; format: "uuid" tells an agent the same in a few tokens
function toolInput<Shape extends z.ZodRawShape>(shape: Shape) {
  const schema = z.object(shape);
  const standard = schema["~standard"];
  return {
    "~standard": {
      ...standard,
      jsonSchema: {
        ...standard.jsonSchema,
        input: (options) =>
          JSON.parse(
            JSON.stringify(
              standard.jsonSchema.input(options),
              function (this: Record<string, unknown>, key, value: unknown) {
                return key === "pattern" && this.format === "uuid"
                  ? undefined
                  : value;
              },
            ),
          ) as Record<string, unknown>,
      },
    },
  } satisfies StandardSchemaWithJSON<
    z.input<typeof schema>,
    z.output<typeof schema>
  >;
}

// why: tool schemas stay flat z.object — Claude rejects a top-level oneOf, so planner unions are parsed inside callbacks
function plannerServer(caller: Caller): McpServer {
  const server = new McpServer(
    { name: "uweek", version: "1.0.0" },
    { instructions: serverInstructions },
  );

  server.registerTool(
    "list_week",
    {
      description: `Read one planner week: its dates, lists and tasks, including repeating occurrences. Without week, the week containing today is read; week is any date in the wanted week. ${datesNote}`,
      inputSchema: toolInput({
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
      inputSchema: toolInput({
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
          {
            ...where,
            ...(completed !== undefined && {
              completed: completed ? "true" : "false",
            }),
            ...(text !== undefined && { q: text }),
          },
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
      inputSchema: toolInput({
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
      description: `Create a task. Pass exactly one of date or listId: date puts it on a day, listId into a list. ${dateFormat}`,
      inputSchema: toolInput({
        title: title.describe("Task title."),
        date: isoDate.optional().describe("Day to place the task on."),
        listId: listId.optional().describe("List to place the task in."),
      }),
    },
    async (args) => run(() => createTask(caller.userId, args)),
  );

  server.registerTool(
    "update_task",
    {
      description: `Change a task's fields. checklist replaces the whole checklist; completed: false unchecks it; repeat: null stops the series. ${idNote} ${dateFormat}`,
      inputSchema: toolInput({
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
      return run(() => updateTask(caller.userId, id, changes, inScope));
    },
  );

  server.registerTool(
    "move_task",
    {
      description: `Move a task to date or listId, exactly one of them, and optionally to index within that day or list (0 is first). ${dateFormat} ${idNote}`,
      inputSchema: toolInput({
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
        updateTask(caller.userId, id, { placement: placement.parse(to) }),
      );
    },
  );

  server.registerTool(
    "complete_task",
    {
      description: `Mark a task completed; use update_task with completed: false to undo it. ${idNote}`,
      inputSchema: toolInput({ id: taskId.describe("Task id.") }),
    },
    async ({ id }) =>
      run(() => updateTask(caller.userId, id, { completed: true })),
  );

  server.registerTool(
    "delete_task",
    {
      description: `Delete a task. ${idNote}`,
      inputSchema: toolInput({
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
        await deleteTask(caller.userId, id, inScope);
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
