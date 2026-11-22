import { afterAll, expect, test } from "vitest";
import {
  Client,
  SdkHttpError,
  StreamableHTTPClientTransport,
  type CallToolResult,
} from "@modelcontextprotocol/client";
import { z } from "zod";
import { createApiToken, revokeApiToken } from "./api-tokens";
import { db } from "./db/client";
import { users } from "./db/schema";
import { handleMcpRequest } from "./mcp";
import { createList, updateSettings } from "./planner";
import { edits, newTask } from "./planner-schemas";

// why: this is the instant the browser clock fixture pins in the Playwright suite, so "today" is 2026-11-09 below
const now = new Date("2026-11-09T07:00:00Z");
const origin = "http://uweek.test";

afterAll(() => db.$client.end());

async function newUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insert(users)
    .values({ id, name: "", email: `${id}@example.com`, emailVerified: true });
  // why: mirrors what a first session leaves behind — a reported time zone, so reads roll over, and the Inbox list
  await updateSettings(id, { timeZone: "Europe/Moscow" });
  await createList(id, { title: "Inbox" });
  return id;
}

interface Agent {
  userId: string;
  tokenId: string;
  token: string;
  client: Client;
  close(): Promise<void>;
}

async function connectAgent(): Promise<Agent> {
  const userId = await newUser();
  const { token, info } = await createApiToken(userId, { name: "Agent" });
  const client = await handshake(token);
  return {
    userId,
    tokenId: info.id,
    token,
    client,
    close: () => client.close(),
  };
}

function handshake(token?: string): Promise<Client> {
  const client = new Client({ name: "uweek-vitest", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", origin), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    fetch: (url, init) => handleMcpRequest(new Request(url, init), now),
  });
  return client.connect(transport).then(() => client);
}

function text(result: CallToolResult): string {
  return (result.content[0] as { text: string }).text;
}

function json(result: CallToolResult): unknown {
  return JSON.parse(text(result));
}

function explanation(schema: z.ZodType, input: unknown): string {
  const parsed = schema.safeParse(input);
  if (parsed.success)
    throw new Error("expected the planner schema to refuse this input");
  return z.prettifyError(parsed.error);
}

test("an agent without a valid token is refused", async () => {
  for (const headers of [undefined, { Authorization: "Bearer yw_short" }]) {
    const response = await handleMcpRequest(
      new Request(`${origin}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...headers,
        },
        body: "{}",
      }),
      now,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
  }

  const unreachable = () => handshake();
  await expect(unreachable()).rejects.toBeInstanceOf(SdkHttpError);
  await expect(unreachable()).rejects.toMatchObject({ status: 401 });
});

test("an agent connects with a token and sees the planner tools", async () => {
  const agent = await connectAgent();
  try {
    const instructions = agent.client.getInstructions();
    expect(instructions).toContain("weekly planner");
    expect(instructions).toContain("YYYY-MM-DD");
    const { tools } = await agent.client.listTools();
    expect(JSON.stringify(tools)).not.toContain("[0-9a-fA-F]{8}");
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "complete_task",
      "create_task",
      "delete_task",
      "list_lists",
      "list_tasks",
      "list_week",
      "move_task",
      "search_tasks",
      "update_task",
    ]);
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      const schema = tool.inputSchema as Record<string, unknown>;
      expect(schema, tool.name).not.toHaveProperty("oneOf");
      expect(schema, tool.name).not.toHaveProperty("anyOf");
    }
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of ["list_week", "list_tasks", "create_task", "move_task"])
      expect(byName.get(name)?.description, name).toContain("YYYY-MM-DD");
    expect(byName.get("list_week")!.description).toContain("time zone");
  } finally {
    await agent.close();
  }
});

test("an agent creates a task and completes it", async () => {
  const agent = await connectAgent();
  try {
    const created = json(
      await agent.client.callTool({
        name: "create_task",
        arguments: { title: "Call the bank", date: "2026-11-10" },
      }),
    ) as { id: string };
    expect(created).toMatchObject({
      title: "Call the bank",
      date: "2026-11-10",
      completed: false,
    });

    expect(
      json(
        await agent.client.callTool({
          name: "complete_task",
          arguments: { id: created.id },
        }),
      ),
    ).toMatchObject({ id: created.id, completed: true });

    const week = json(
      await agent.client.callTool({
        name: "list_week",
        arguments: { week: "2026-11-10" },
      }),
    ) as { today: string; tasks: { id: string; completed: boolean }[] };
    expect(week.today).toBe("2026-11-09");
    expect(week.tasks.find((task) => task.id === created.id)).toMatchObject({
      completed: true,
    });
  } finally {
    await agent.close();
  }
});

test("an agent reads lists, searches, updates, moves and deletes a task", async () => {
  const agent = await connectAgent();
  try {
    const lists = json(
      await agent.client.callTool({ name: "list_lists", arguments: {} }),
    ) as { id: string; title: string }[];
    expect(lists).toEqual([{ id: expect.any(String), title: "Inbox" }]);
    const inbox = lists[0].id;

    const created = json(
      await agent.client.callTool({
        name: "create_task",
        arguments: { title: "Renew passport", listId: inbox },
      }),
    ) as { id: string };
    expect(created).toMatchObject({ title: "Renew passport", listId: inbox });

    const found = json(
      await agent.client.callTool({
        name: "search_tasks",
        arguments: { query: "passport" },
      }),
    ) as { items: { id: string }[]; nextCursor: number | null };
    expect(found.items.map((item) => item.id)).toContain(created.id);
    expect(found.nextCursor).toBeNull();

    expect(
      json(
        await agent.client.callTool({
          name: "update_task",
          arguments: { id: created.id, notes: "Bring photos" },
        }),
      ),
    ).toMatchObject({ id: created.id, notes: "Bring photos" });

    const moved = json(
      await agent.client.callTool({
        name: "move_task",
        arguments: { id: created.id, date: "2026-11-12" },
      }),
    ) as Record<string, unknown>;
    expect(moved).toMatchObject({ id: created.id, date: "2026-11-12" });
    expect(moved).not.toHaveProperty("listId");

    const listed = async () =>
      json(
        await agent.client.callTool({
          name: "list_tasks",
          arguments: {
            from: "2026-11-09",
            to: "2026-11-15",
            completed: false,
          },
        }),
      ) as { id: string }[];
    expect((await listed()).map((task) => task.id)).toContain(created.id);

    expect(
      json(
        await agent.client.callTool({
          name: "delete_task",
          arguments: { id: created.id },
        }),
      ),
    ).toEqual({ id: created.id, deleted: true });
    expect((await listed()).map((task) => task.id)).not.toContain(created.id);
  } finally {
    await agent.close();
  }
});

test("tool errors reach the agent as tool results", async () => {
  const agent = await connectAgent();
  const other = await connectAgent();
  try {
    const refused = await agent.client.callTool({
      name: "create_task",
      arguments: {
        title: "Two places",
        date: "2026-11-10",
        listId: crypto.randomUUID(),
      },
    });
    expect(refused.isError).toBe(true);

    const malformed = await agent.client.callTool({
      name: "complete_task",
      arguments: { id: "not-a-task-id" },
    });
    expect(malformed.isError).toBe(true);

    const theirs = json(
      await other.client.callTool({
        name: "create_task",
        arguments: { title: "Theirs", date: "2026-11-09" },
      }),
    ) as { id: string };
    const stolen = await agent.client.callTool({
      name: "complete_task",
      arguments: { id: theirs.id },
    });
    expect(stolen.isError).toBe(true);
    expect(text(stolen)).toBe("Resource not found");

    const week = json(
      await other.client.callTool({
        name: "list_week",
        arguments: { week: "2026-11-09" },
      }),
    ) as { tasks: { id: string; completed: boolean }[] };
    expect(week.tasks.find((task) => task.id === theirs.id)).toMatchObject({
      completed: false,
    });
  } finally {
    await agent.close();
    await other.close();
  }
});

test("an invalid tool argument comes back as the schema's own explanation", async () => {
  const agent = await connectAgent();
  try {
    const twoPlaces = {
      title: "Two places",
      date: "2026-11-10",
      listId: crypto.randomUUID(),
    };
    const placed = await agent.client.callTool({
      name: "create_task",
      arguments: twoPlaces,
    });
    expect(placed.isError).toBe(true);
    expect(text(placed)).toBe(explanation(newTask, twoPlaces));

    const task = json(
      await agent.client.callTool({
        name: "create_task",
        arguments: { title: "Mine", date: "2026-11-09" },
      }),
    ) as { id: string };
    const unchanged = await agent.client.callTool({
      name: "update_task",
      arguments: { id: task.id },
    });
    expect(unchanged.isError).toBe(true);
    expect(text(unchanged)).toBe(explanation(edits, {}));
  } finally {
    await agent.close();
  }
});

test("a revoked token stops working at once", async () => {
  const agent = await connectAgent();
  try {
    expect(
      (await agent.client.callTool({ name: "list_lists", arguments: {} }))
        .isError,
    ).toBeFalsy();

    expect(await revokeApiToken(agent.userId, agent.tokenId)).toBe(true);

    const revoked = agent.client.callTool({
      name: "list_lists",
      arguments: {},
    });
    await expect(revoked).rejects.toBeInstanceOf(SdkHttpError);
    await expect(revoked).rejects.toMatchObject({ status: 401 });

    const rejected = handshake(agent.token);
    await expect(rejected).rejects.toBeInstanceOf(SdkHttpError);
    await expect(rejected).rejects.toMatchObject({ status: 401 });
  } finally {
    await agent.close();
  }
});
