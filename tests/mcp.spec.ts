import { expect, test } from "@playwright/test";
import {
  Client,
  SdkHttpError,
  StreamableHTTPClientTransport,
  type CallToolResult,
} from "@modelcontextprotocol/client";
import { newApiUser, pinnedNow } from "./api-helpers";
import { testClockCookie } from "./clock";

async function connect(baseURL: string, token?: string): Promise<Client> {
  const headers: Record<string, string> = {
    Cookie: `${testClockCookie}=${new Date(pinnedNow).toISOString()}`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const transport = new StreamableHTTPClientTransport(
    new URL("/mcp", baseURL),
    { requestInit: { headers } },
  );
  const client = new Client({ name: "yourweek-e2e", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

function json(result: CallToolResult): unknown {
  return JSON.parse((result.content[0] as { text: string }).text);
}

test("an agent without a valid token is refused", async ({
  request,
  baseURL,
}) => {
  for (const headers of [
    undefined,
    { Authorization: "Bearer yw_short" },
  ] as const) {
    const response = await request.post("/mcp", { data: {}, headers });
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toContain("Bearer");
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
  }

  const failed = connect(baseURL!);
  await expect(failed).rejects.toBeInstanceOf(SdkHttpError);
  await expect(failed).rejects.toMatchObject({ status: 401 });
});

test("an agent connects with a token and sees the planner tools", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  let client: Client | undefined;
  try {
    client = await connect(baseURL!, user.token);
    const { tools } = await client.listTools();
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
    await client?.close();
    await user.close();
  }
});

test("an agent creates a task and completes it, and the week shows it", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  let client: Client | undefined;
  try {
    client = await connect(baseURL!, user.token);

    const created = json(
      await client.callTool({
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
        await client.callTool({
          name: "complete_task",
          arguments: { id: created.id },
        }),
      ),
    ).toMatchObject({ id: created.id, completed: true });

    const week = json(
      await client.callTool({
        name: "list_week",
        arguments: { week: "2026-11-10" },
      }),
    ) as { today: string; tasks: { id: string; completed: boolean }[] };
    expect(week.today).toBe("2026-11-09");
    expect(week.tasks.find((task) => task.id === created.id)).toMatchObject({
      completed: true,
    });

    await user.page.goto("/");
    const shown = user.page.getByRole("button", {
      name: "Call the bank",
      exact: true,
    });
    await expect(shown).toBeVisible();
    await expect(shown).toHaveAttribute("aria-pressed", "true");
  } finally {
    await client?.close();
    await user.close();
  }
});

test("an agent reads lists, searches, updates, moves and deletes a task", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  let client: Client | undefined;
  try {
    client = await connect(baseURL!, user.token);

    const lists = json(
      await client.callTool({ name: "list_lists", arguments: {} }),
    ) as { id: string; title: string }[];
    expect(lists).toEqual([{ id: expect.any(String), title: "Inbox" }]);
    const inbox = lists[0].id;

    const created = json(
      await client.callTool({
        name: "create_task",
        arguments: { title: "Renew passport", listId: inbox },
      }),
    ) as { id: string };
    expect(created).toMatchObject({ title: "Renew passport", listId: inbox });

    const found = json(
      await client.callTool({
        name: "search_tasks",
        arguments: { query: "passport" },
      }),
    ) as { items: { id: string }[]; nextCursor: number | null };
    expect(found.items.map((item) => item.id)).toContain(created.id);
    expect(found.nextCursor).toBeNull();

    expect(
      json(
        await client.callTool({
          name: "update_task",
          arguments: { id: created.id, notes: "Bring photos" },
        }),
      ),
    ).toMatchObject({ id: created.id, notes: "Bring photos" });

    const moved = json(
      await client.callTool({
        name: "move_task",
        arguments: { id: created.id, date: "2026-11-12" },
      }),
    ) as Record<string, unknown>;
    expect(moved).toMatchObject({ id: created.id, date: "2026-11-12" });
    expect(moved).not.toHaveProperty("listId");

    const listed = async () =>
      json(
        await client!.callTool({
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
        await client.callTool({
          name: "delete_task",
          arguments: { id: created.id },
        }),
      ),
    ).toEqual({ id: created.id, deleted: true });
    expect((await listed()).map((task) => task.id)).not.toContain(created.id);
  } finally {
    await client?.close();
    await user.close();
  }
});

test("tool errors reach the agent as tool results", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  const other = await newApiUser(browser, baseURL!);
  let client: Client | undefined;
  let otherClient: Client | undefined;
  try {
    client = await connect(baseURL!, user.token);
    otherClient = await connect(baseURL!, other.token);

    const refused = await client.callTool({
      name: "create_task",
      arguments: {
        title: "Two places",
        date: "2026-11-10",
        listId: crypto.randomUUID(),
      },
    });
    expect(refused.isError).toBe(true);

    const theirs = json(
      await otherClient.callTool({
        name: "create_task",
        arguments: { title: "Theirs", date: "2026-11-09" },
      }),
    ) as { id: string };
    const stolen = await client.callTool({
      name: "complete_task",
      arguments: { id: theirs.id },
    });
    expect(stolen.isError).toBe(true);
    expect((stolen.content[0] as { text: string }).text).toBe(
      "Resource not found",
    );

    const week = json(
      await otherClient.callTool({
        name: "list_week",
        arguments: { week: "2026-11-09" },
      }),
    ) as { tasks: { id: string; completed: boolean }[] };
    expect(week.tasks.find((task) => task.id === theirs.id)).toMatchObject({
      completed: false,
    });
  } finally {
    await client?.close();
    await otherClient?.close();
    await user.close();
    await other.close();
  }
});

test("a revoked token stops working at once", async ({ browser, baseURL }) => {
  const user = await newApiUser(browser, baseURL!);
  let client: Client | undefined;
  try {
    client = await connect(baseURL!, user.token);
    expect(
      (await client.callTool({ name: "list_lists", arguments: {} })).isError,
    ).toBeFalsy();

    await user.page.getByRole("button", { name: "Revoke Agent" }).click();
    await expect(
      user.page.getByRole("button", { name: "Revoke Agent" }),
    ).toHaveCount(0);

    await expect(
      client.callTool({ name: "list_lists", arguments: {} }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(connect(baseURL!, user.token)).rejects.toMatchObject({
      status: 401,
    });
  } finally {
    await client?.close();
    await user.close();
  }
});

test("the token settings show how to connect an agent", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  try {
    const region = user.page.getByRole("region", { name: "Connect an agent" });
    await expect(region).toContainText(`${baseURL}/mcp`);
    await expect(region).toContainText(
      '"Authorization": "Bearer YOUR_API_TOKEN"',
    );
    await expect(region).toContainText('"type": "http"');

    await user.page.setViewportSize({ width: 360, height: 800 });
    await user.page.reload();
    const widths = await user.page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  } finally {
    await user.close();
  }
});
