import { expect, test } from "@playwright/test";
import { issueApiToken, newApiUser } from "./api-helpers";

test("a token from the settings page reaches the route handler", async ({
  browser,
  baseURL,
  request,
}) => {
  const user = await newApiUser(browser, baseURL!);
  try {
    const document = await request.get("/api/v1/openapi.json");
    expect(document.status()).toBe(200);
    expect(document.headers()["content-type"]).toContain("application/json");

    const head = await request.fetch("/api/v1/openapi.json", {
      method: "HEAD",
    });
    expect(head.status()).toBe(200);
    expect(head.headers()["content-type"]).toContain("application/json");
    expect(await head.text()).toBe("");

    const sessionOnly = await user.page.context().request.get("/api/v1/lists");
    expect(sessionOnly.status()).toBe(401);

    const lists = await user.client.get("/api/v1/lists");
    expect(lists.status()).toBe(200);
    expect(lists.headers()["cache-control"]).toContain("no-store");
    expect(await lists.json()).toEqual([
      { id: expect.any(String), title: "Inbox" },
    ]);

    const headLists = await user.client.fetch("/api/v1/lists", {
      method: "HEAD",
    });
    expect(headLists.status()).toBe(200);
    expect(await headLists.text()).toBe("");

    await user.page.reload();
    const row = user.page.getByRole("row", { name: /Agent/ });
    await expect(row).toBeVisible();
    await expect(row).not.toContainText("Never used");
  } finally {
    await user.close();
  }
});

test("the shared 120-request budget is per token", async ({
  browser,
  baseURL,
  request,
}) => {
  const user = await newApiUser(browser, baseURL!);
  try {
    for (let index = 0; index < 120; index++)
      expect(
        (
          await user.client.get(
            index % 2 === 0
              ? "/api/v1/lists"
              : "/api/v1/tasks?from=2026-11-09&to=2026-11-09",
          )
        ).status(),
        `request ${index + 1}`,
      ).toBe(200);

    const limited = await user.client.get("/api/v1/lists");
    expect(limited.status()).toBe(429);
    expect(await limited.json()).toEqual({
      error: { code: "rate_limited", message: expect.any(String) },
    });
    const retryAfter = Number(limited.headers()["retry-after"]);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);

    const second = await issueApiToken(user.page, "Second");
    expect(
      (
        await request.get("/api/v1/lists", {
          headers: { Authorization: `Bearer ${second}` },
        })
      ).status(),
    ).toBe(200);

    expect((await request.get("/api/v1/openapi.json")).status()).toBe(200);
  } finally {
    await user.close();
  }
});
