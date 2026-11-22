import { expect, test } from "@playwright/test";
import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolResult,
} from "@modelcontextprotocol/client";
import { newApiUser, pinnedNow } from "./api-helpers";
import { testClockCookie } from "./clock";

async function connect(baseURL: string, token: string): Promise<Client> {
  const headers: Record<string, string> = {
    Cookie: `${testClockCookie}=${new Date(pinnedNow).toISOString()}`,
    Authorization: `Bearer ${token}`,
  };
  const transport = new StreamableHTTPClientTransport(
    new URL("/mcp", baseURL),
    { requestInit: { headers } },
  );
  const client = new Client({ name: "uweek-e2e", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

function json(result: CallToolResult): unknown {
  return JSON.parse((result.content[0] as { text: string }).text);
}

test("a token from the settings page reaches the MCP route", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  let client: Client | undefined;
  try {
    client = await connect(baseURL!, user.token);
    expect(client.getInstructions()).toContain("weekly planner");

    expect(
      json(await client.callTool({ name: "list_lists", arguments: {} })),
    ).toEqual([{ id: expect.any(String), title: "Inbox" }]);
    expect(
      json(
        await client.callTool({
          name: "create_task",
          arguments: { title: "Call the bank", date: "2026-11-10" },
        }),
      ),
    ).toMatchObject({ title: "Call the bank", date: "2026-11-10" });

    await user.page.goto("/");
    await expect(
      user.page.getByRole("button", { name: "Call the bank", exact: true }),
    ).toBeVisible();
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
