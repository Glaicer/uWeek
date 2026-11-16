import { expect, test, type APIResponse } from "@playwright/test";
import { issueApiToken, newApiUser } from "./api-helpers";

test("the OpenAPI document is public over HTTP", async ({ request }) => {
  const response = await request.get("/api/v1/openapi.json", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  const document = await response.json();
  expect(document.openapi).toBe("3.1.0");
  expect(document.paths).toHaveProperty("/tasks");
  expect(document.components.securitySchemes.bearerAuth).toMatchObject({
    type: "http",
    scheme: "bearer",
  });

  const head = await request.fetch("/api/v1/openapi.json", {
    method: "HEAD",
    maxRedirects: 0,
  });
  expect(head.status()).toBe(200);
  expect(head.headers()["content-type"]).toContain("application/json");
  expect(await head.text()).toBe("");
});

test("protected HTTP routes accept Bearer but never a session alone", async ({
  request,
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  try {
    const denied = [
      await request.get("/api/v1/lists"),
      await request.get("/api/v1/lists", {
        headers: { Authorization: "Bearer yw_short" },
      }),
      await request.get("/api/v1/lists", {
        headers: { Authorization: "Basic dXNlcjpwYXNz" },
      }),
      await user.page.context().request.get("/api/v1/lists"),
    ];
    const bodies: unknown[] = [];
    for (const response of denied) {
      expect(response.status()).toBe(401);
      expect(response.headers()["www-authenticate"]).toContain("Bearer");
      expect(response.headers()["cache-control"]).toContain("no-store");
      bodies.push(await response.json());
    }
    for (const body of bodies)
      expect(body).toEqual({
        error: { code: "unauthorized", message: expect.any(String) },
      });
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);

    const allowed = await user.client.get("/api/v1/lists");
    expect(allowed.status()).toBe(200);
    expect(allowed.headers()["cache-control"]).toContain("no-store");
    expect(await allowed.json()).toEqual([
      { id: expect.any(String), title: "Inbox" },
    ]);

    const head = await user.client.fetch("/api/v1/lists", {
      method: "HEAD",
    });
    expect(head.status()).toBe(200);
    expect(await head.text()).toBe("");

    await user.page.reload();
    const row = user.page.getByRole("row", { name: /Agent/ });
    await expect(row).toBeVisible();
    await expect(row).not.toContainText("Never used");
  } finally {
    await user.close();
  }
});

test("a task completes its full HTTP lifecycle", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  try {
    const created = await user.client.post("/api/v1/tasks", {
      data: { title: "Buy milk", date: "2026-11-09" },
    });
    expect(created.status()).toBe(201);
    const task = await created.json();
    expect(task).toEqual({
      id: expect.any(String),
      title: "Buy milk",
      completed: false,
      notes: "",
      color: null,
      checklist: [],
      date: "2026-11-09",
    });
    expect(created.headers()["location"]).toBe(`/api/v1/tasks/${task.id}`);

    const read = await user.client.get(`/api/v1/tasks/${task.id}`);
    expect(read.status()).toBe(200);
    expect(await read.json()).toEqual(task);

    const item = crypto.randomUUID();
    const patched = await user.client.patch(`/api/v1/tasks/${task.id}`, {
      data: {
        title: "Buy oat milk",
        notes: "Cold",
        color: "green",
        checklist: [{ id: item, text: "Oat", completed: true }],
      },
    });
    expect(patched.status()).toBe(200);
    expect(await patched.json()).toMatchObject({
      id: task.id,
      title: "Buy oat milk",
      notes: "Cold",
      color: "green",
      checklist: [{ id: item, text: "Oat", completed: true }],
      date: "2026-11-09",
    });

    expect(
      (await user.client.post(`/api/v1/tasks/${task.id}/complete`)).status(),
    ).toBe(200);
    expect(
      await (await user.client.get(`/api/v1/tasks/${task.id}`)).json(),
    ).toMatchObject({ completed: true });
    expect(
      (await user.client.post(`/api/v1/tasks/${task.id}/uncomplete`)).status(),
    ).toBe(200);
    expect(
      await (await user.client.get(`/api/v1/tasks/${task.id}`)).json(),
    ).toMatchObject({ completed: false });

    const second = await (
      await user.client.post("/api/v1/tasks", {
        data: { title: "Second", date: "2026-11-11" },
      })
    ).json();
    const moved = await user.client.post(`/api/v1/tasks/${task.id}/move`, {
      data: { date: "2026-11-11", index: 0 },
    });
    expect(moved.status()).toBe(200);
    expect(await moved.json()).toMatchObject({
      id: task.id,
      date: "2026-11-11",
    });

    const listed = await user.client.get(
      "/api/v1/tasks?from=2026-11-09&to=2026-11-11",
    );
    expect(listed.status()).toBe(200);
    expect(
      (await listed.json()).map((each: { title: string }) => each.title),
    ).toEqual(["Buy oat milk", "Second"]);

    await user.client.post(`/api/v1/tasks/${task.id}/complete`);
    await user.page.goto("/");
    const shown = user.page.getByRole("button", {
      name: "Buy oat milk",
      exact: true,
    });
    await expect(shown).toBeVisible();
    await expect(shown).toHaveAttribute("aria-pressed", "true");

    const deleted = await user.client.delete(`/api/v1/tasks/${task.id}`);
    expect(deleted.status()).toBe(204);
    expect((await user.client.get(`/api/v1/tasks/${task.id}`)).status()).toBe(
      404,
    );
    expect((await user.client.get(`/api/v1/tasks/${second.id}`)).status()).toBe(
      200,
    );
  } finally {
    await user.close();
  }
});

test("lists and their tasks are managed over HTTP", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  try {
    const first = await (
      await user.client.post("/api/v1/lists", {
        data: { title: "Errands" },
      })
    ).json();
    const second = await (
      await user.client.post("/api/v1/lists", {
        data: { title: "Reading" },
      })
    ).json();
    expect(first).toEqual({ id: expect.any(String), title: "Errands" });
    expect(
      (
        await user.client.patch(`/api/v1/lists/${first.id}`, {
          data: { title: "Chores" },
        })
      ).status(),
    ).toBe(200);

    expect(
      (
        await user.client.post(`/api/v1/lists/${second.id}/move`, {
          data: { to: 0 },
        })
      ).status(),
    ).toBe(204);
    expect(
      (
        await user.client.post(`/api/v1/lists/${first.id}/move`, {
          data: { to: 1 },
        })
      ).status(),
    ).toBe(204);
    expect(
      (await (await user.client.get("/api/v1/lists")).json()).map(
        (list: { title: string }) => list.title,
      ),
    ).toEqual(["Reading", "Chores", "Inbox"]);

    const inList = await (
      await user.client.post("/api/v1/tasks", {
        data: { title: "Dune", listId: second.id },
      })
    ).json();
    expect(inList).toMatchObject({ title: "Dune", listId: second.id });

    const dated = await (
      await user.client.post("/api/v1/tasks", {
        data: { title: "Milk", date: "2026-11-09" },
      })
    ).json();
    expect(
      await (
        await user.client.post(`/api/v1/tasks/${dated.id}/move`, {
          data: { listId: second.id },
        })
      ).json(),
    ).toMatchObject({ id: dated.id, listId: second.id });

    const listed = await user.client.get(`/api/v1/tasks?listId=${second.id}`);
    expect(listed.status()).toBe(200);
    expect(
      (await listed.json()).map((task: { title: string }) => task.title),
    ).toEqual(["Dune", "Milk"]);

    expect(
      await (
        await user.client.post(`/api/v1/tasks/${dated.id}/move`, {
          data: { date: "2026-11-10" },
        })
      ).json(),
    ).toMatchObject({ id: dated.id, date: "2026-11-10" });

    expect(
      (await user.client.delete(`/api/v1/lists/${second.id}`)).status(),
    ).toBe(204);
    expect((await user.client.get(`/api/v1/tasks/${inList.id}`)).status()).toBe(
      404,
    );
    expect(
      (await (await user.client.get("/api/v1/lists")).json()).map(
        (list: { title: string }) => list.title,
      ),
    ).toEqual(["Chores", "Inbox"]);

    expect(
      (await user.client.delete(`/api/v1/lists/${first.id}`)).status(),
    ).toBe(204);
    const last = await user.client.delete("/api/v1/lists/not-a-uuid");
    expect(last.status()).toBe(400);
    const [inbox] = (await (await user.client.get("/api/v1/lists")).json()) as {
      id: string;
    }[];
    const refused = await user.client.delete(`/api/v1/lists/${inbox.id}`);
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual({
      error: { code: "conflict", message: "Cannot delete the last list" },
    });
    expect((await user.client.get("/api/v1/lists")).status()).toBe(200);
    expect((await (await user.client.get("/api/v1/lists")).json()).length).toBe(
      1,
    );
  } finally {
    await user.close();
  }
});

test("HTTP task queries filter a date range and list by status and text", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  try {
    const list = await (
      await user.client.post("/api/v1/lists", {
        data: { title: "Ideas" },
      })
    ).json();
    const create = async (data: Record<string, unknown>) =>
      (await user.client.post("/api/v1/tasks", { data })).json();

    const range = await create({
      title: "Range",
      date: "2026-11-09",
    });
    const also = await create({ title: "Also", date: "2026-11-11" });
    const outside = await create({
      title: "Outside",
      date: "2026-11-12",
    });
    const done = await create({ title: "Done", date: "2026-11-10" });
    await user.client.post(`/api/v1/tasks/${done.id}/complete`);
    const noted = await create({ title: "Noted", date: "2026-11-10" });
    await user.client.patch(`/api/v1/tasks/${noted.id}`, {
      data: { notes: "Buy 50% milk" },
    });
    const literal = await create({
      title: "Buy 50 milk",
      date: "2026-11-10",
    });
    await create({ title: "Plan_A", date: "2026-11-10" });
    await create({ title: "Plan A", date: "2026-11-10" });
    const listed = await create({ title: "Listed", listId: list.id });

    const titles = async (url: string) => {
      const response = await user.client.get(url);
      expect(response.status()).toBe(200);
      return ((await response.json()) as { title: string }[]).map(
        (task) => task.title,
      );
    };

    const both = await titles("/api/v1/tasks?from=2026-11-09&to=2026-11-11");
    expect(both).toContain(range.title);
    expect(both).toContain(also.title);
    expect(both).not.toContain(outside.title);
    expect(both).not.toContain(listed.title);

    const open = await titles(
      "/api/v1/tasks?from=2026-11-09&to=2026-11-11&completed=false",
    );
    expect(open).not.toContain(done.title);
    expect(open).toContain(noted.title);

    expect(
      await titles(
        `/api/v1/tasks?from=2026-11-09&to=2026-11-11&q=${encodeURIComponent(
          "MILK",
        )}`,
      ),
    ).toEqual([noted.title, literal.title]);
    expect(
      await titles(
        `/api/v1/tasks?from=2026-11-09&to=2026-11-11&q=${encodeURIComponent(
          "%",
        )}`,
      ),
    ).toEqual([noted.title]);
    expect(
      await titles(
        `/api/v1/tasks?from=2026-11-09&to=2026-11-11&q=${encodeURIComponent(
          "_",
        )}`,
      ),
    ).toEqual(["Plan_A"]);
    expect(await titles(`/api/v1/tasks?listId=${list.id}`)).toEqual([
      listed.title,
    ]);

    for (const url of [
      "/api/v1/tasks?from=2026-11-09",
      "/api/v1/tasks?from=2026-11-09&to=2026-11-11&listId=" + list.id,
      "/api/v1/tasks?from=2026-11-12&to=2026-11-09",
      "/api/v1/tasks?listId=" + list.id + "&completed=anything",
      "/api/v1/tasks?from=2026-11-09&to=2026-11-11&unknown=1",
      "/api/v1/tasks?from=2026-11-09&from=2026-11-10&to=2026-11-11",
    ]) {
      const response = await user.client.get(url);
      expect(response.status(), url).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: "invalid_request", message: expect.any(String) },
      });
    }
  } finally {
    await user.close();
  }
});

test("HTTP exposes virtual occurrences and this-or-following edits", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  type ApiTask = {
    id: string;
    title: string;
    completed: boolean;
    date: string;
    recurrence?: { seriesId: string; occurrence: string };
  };
  const range = async (from: string, to: string) =>
    (await (
      await user.client.get(`/api/v1/tasks?from=${from}&to=${to}`)
    ).json()) as ApiTask[];

  try {
    const seed = await (
      await user.client.post("/api/v1/tasks", {
        data: { title: "Seed", date: "2026-11-10" },
      })
    ).json();
    expect(
      (
        await user.client.patch(`/api/v1/tasks/${seed.id}`, {
          data: {
            repeat: {
              every: "day",
              interval: 1,
              until: "2026-11-14",
            },
          },
        })
      ).status(),
    ).toBe(200);

    const five = await range("2026-11-10", "2026-11-14");
    expect(five.map((task) => task.date)).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
    const twelve = five.find((task) => task.date === "2026-11-12")!;
    expect(twelve.id).toBe(`${five[0].recurrence!.seriesId}_2026-11-12`);
    const read = await user.client.get(`/api/v1/tasks/${twelve.id}`);
    expect(read.status()).toBe(200);
    expect(await read.json()).toEqual(twelve);

    expect(
      (await user.client.post(`/api/v1/tasks/${five[1].id}/complete`)).status(),
    ).toBe(200);
    expect(
      (await range("2026-11-10", "2026-11-14"))
        .filter((task) => task.completed)
        .map((task) => task.date),
    ).toEqual(["2026-11-11"]);

    expect(
      (
        await user.client.patch(`/api/v1/tasks/${five[3].id}?scope=following`, {
          data: { title: "Changed" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await range("2026-11-10", "2026-11-14")).map((task) => [
        task.date,
        task.title,
      ]),
    ).toEqual([
      ["2026-11-10", "Seed"],
      ["2026-11-11", "Seed"],
      ["2026-11-12", "Seed"],
      ["2026-11-13", "Changed"],
      ["2026-11-14", "Changed"],
    ]);

    const fourteen = (await range("2026-11-10", "2026-11-14")).find(
      (task) => task.date === "2026-11-14",
    )!;
    expect(
      (
        await user.client.post(`/api/v1/tasks/${fourteen.id}/move`, {
          data: { date: "2026-11-15" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await range("2026-11-10", "2026-11-14")).map((task) => task.date),
    ).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(await range("2026-11-15", "2026-11-15")).toMatchObject([
      { date: "2026-11-15", recurrence: { occurrence: "2026-11-14" } },
    ]);

    expect(
      (
        await user.client.delete(`/api/v1/tasks/${twelve.id}?scope=this`)
      ).status(),
    ).toBe(204);
    expect(
      (await range("2026-11-10", "2026-11-14")).map((task) => task.date),
    ).toEqual(["2026-11-10", "2026-11-11", "2026-11-13"]);
    expect((await user.client.get(`/api/v1/tasks/${twelve.id}`)).status()).toBe(
      404,
    );
    expect(
      (await range("2026-11-10", "2026-11-14")).map((task) => task.id),
    ).not.toContain(twelve.id);

    expect(
      (
        await user.client.delete(`/api/v1/tasks/${five[3].id}?scope=following`)
      ).status(),
    ).toBe(204);
    expect(
      (await range("2026-11-10", "2026-11-16")).map((task) => [
        task.date,
        task.title,
      ]),
    ).toEqual([
      ["2026-11-10", "Seed"],
      ["2026-11-11", "Seed"],
    ]);
  } finally {
    await user.close();
  }
});

test("HTTP date reads roll overdue tasks and missed occurrences to the owner's today", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  try {
    await user.client.post("/api/v1/tasks", {
      data: { title: "Overdue", date: "2026-11-08" },
    });
    const series = await (
      await user.client.post("/api/v1/tasks", {
        data: { title: "Series", date: "2026-11-07" },
      })
    ).json();
    await user.client.patch(`/api/v1/tasks/${series.id}`, {
      data: {
        repeat: { every: "day", interval: 1, until: "2026-11-09" },
      },
    });
    await user.client.post("/api/v1/tasks", {
      data: { title: "Future", date: "2026-11-10" },
    });

    const read = async () =>
      (await (
        await user.client.get("/api/v1/tasks?from=2026-11-09&to=2026-11-10")
      ).json()) as {
        date: string;
        title: string;
        recurrence?: { occurrence: string };
      }[];

    const first = await read();
    const again = await read();
    expect(again).toEqual(first);
    expect(
      first
        .map((task) => [
          task.date,
          task.title,
          task.recurrence?.occurrence ?? null,
        ])
        .sort(),
    ).toEqual([
      ["2026-11-09", "Overdue", null],
      ["2026-11-09", "Series", "2026-11-07"],
      ["2026-11-09", "Series", "2026-11-08"],
      ["2026-11-09", "Series", "2026-11-09"],
      ["2026-11-10", "Future", null],
    ]);
  } finally {
    await user.close();
  }
});

test("another user's resources are indistinguishable from missing resources", async ({
  browser,
  baseURL,
}) => {
  const owner = await newApiUser(browser, baseURL!);
  const other = await newApiUser(browser, baseURL!);
  type ApiTask = {
    id: string;
    date: string;
    title: string;
  };
  const snapshot = async () => ({
    lists: await (await owner.client.get("/api/v1/lists")).json(),
    tasks: await (
      await owner.client.get("/api/v1/tasks?from=2026-11-09&to=2026-11-12")
    ).json(),
  });
  const missing = async (
    foreign: Promise<APIResponse>,
    absent: Promise<APIResponse>,
  ) => {
    const [one, two] = await Promise.all([foreign, absent]);
    expect(one.status()).toBe(404);
    expect(two.status()).toBe(404);
    expect(await one.json()).toEqual(await two.json());
  };

  try {
    const list = await (
      await owner.client.post("/api/v1/lists", {
        data: { title: "Private" },
      })
    ).json();
    const plain = await (
      await owner.client.post("/api/v1/tasks", {
        data: { title: "Secret", date: "2026-11-09" },
      })
    ).json();
    const recurring = await (
      await owner.client.post("/api/v1/tasks", {
        data: { title: "Repeat", date: "2026-11-09" },
      })
    ).json();
    await owner.client.patch(`/api/v1/tasks/${recurring.id}`, {
      data: { repeat: { every: "day", interval: 1, until: null } },
    });
    const occurrences = (await (
      await owner.client.get("/api/v1/tasks?from=2026-11-09&to=2026-11-12")
    ).json()) as ApiTask[];
    const virtual = occurrences.find((task) => task.date === "2026-11-11")!;
    const absent = crypto.randomUUID();
    const before = await snapshot();

    await missing(
      other.client.get(`/api/v1/tasks/${plain.id}`),
      other.client.get(`/api/v1/tasks/${absent}`),
    );
    await missing(
      other.client.patch(`/api/v1/tasks/${plain.id}`, {
        data: { title: "Hacked" },
      }),
      other.client.patch(`/api/v1/tasks/${absent}`, {
        data: { title: "Hacked" },
      }),
    );
    await missing(
      other.client.delete(`/api/v1/tasks/${plain.id}`),
      other.client.delete(`/api/v1/tasks/${absent}`),
    );
    for (const action of ["complete", "uncomplete"]) {
      await missing(
        other.client.post(`/api/v1/tasks/${plain.id}/${action}`),
        other.client.post(`/api/v1/tasks/${absent}/${action}`),
      );
      await missing(
        other.client.post(`/api/v1/tasks/${virtual.id}/${action}`),
        other.client.post(`/api/v1/tasks/${absent}/${action}`),
      );
    }
    await missing(
      other.client.get(`/api/v1/tasks/${virtual.id}`),
      other.client.get(`/api/v1/tasks/${absent}`),
    );
    await missing(
      other.client.patch(`/api/v1/tasks/${virtual.id}`, {
        data: { title: "Hacked" },
      }),
      other.client.patch(`/api/v1/tasks/${absent}`, {
        data: { title: "Hacked" },
      }),
    );
    await missing(
      other.client.delete(`/api/v1/tasks/${virtual.id}`),
      other.client.delete(`/api/v1/tasks/${absent}`),
    );
    await missing(
      other.client.post(`/api/v1/tasks/${virtual.id}/move`, {
        data: { date: "2026-11-12" },
      }),
      other.client.post(`/api/v1/tasks/${absent}/move`, {
        data: { date: "2026-11-12" },
      }),
    );
    await missing(
      other.client.patch(`/api/v1/lists/${list.id}`, {
        data: { title: "Hacked" },
      }),
      other.client.patch(`/api/v1/lists/${absent}`, {
        data: { title: "Hacked" },
      }),
    );
    await missing(
      other.client.post(`/api/v1/lists/${list.id}/move`, {
        data: { to: 0 },
      }),
      other.client.post(`/api/v1/lists/${absent}/move`, {
        data: { to: 0 },
      }),
    );
    await missing(
      other.client.delete(`/api/v1/lists/${list.id}`),
      other.client.delete(`/api/v1/lists/${absent}`),
    );
    await missing(
      other.client.get(`/api/v1/tasks?listId=${list.id}`),
      other.client.get(`/api/v1/tasks?listId=${absent}`),
    );

    expect(await snapshot()).toEqual(before);
    expect(
      (await (await other.client.get("/api/v1/lists")).json()).length,
    ).toBe(1);
    expect(
      await (
        await other.client.get("/api/v1/tasks?from=2026-11-09&to=2026-11-12")
      ).json(),
    ).toEqual([]);
  } finally {
    await owner.close();
    await other.close();
  }
});

test("foreign and missing destination lists return 404 without partial writes", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  const other = await newApiUser(browser, baseURL!);
  try {
    const foreign = await (
      await other.client.post("/api/v1/lists", {
        data: { title: "Theirs" },
      })
    ).json();
    const random = crypto.randomUUID();
    const task = await (
      await user.client.post("/api/v1/tasks", {
        data: { title: "Mine", date: "2026-11-09" },
      })
    ).json();
    const item = crypto.randomUUID();
    await user.client.patch(`/api/v1/tasks/${task.id}`, {
      data: {
        notes: "Keep",
        checklist: [{ id: item, text: "One", completed: false }],
      },
    });
    const readRange = async () =>
      await (
        await user.client.get("/api/v1/tasks?from=2026-11-09&to=2026-11-09")
      ).json();
    const before = await readRange();

    for (const listId of [foreign.id, random]) {
      const created = await user.client.post("/api/v1/tasks", {
        data: { title: "New", listId },
      });
      expect(created.status()).toBe(404);
      expect(await created.json()).toEqual({
        error: { code: "not_found", message: "Resource not found" },
      });

      const moved = await user.client.post(`/api/v1/tasks/${task.id}/move`, {
        data: { listId },
      });
      expect(moved.status()).toBe(404);

      const patched = await user.client.patch(`/api/v1/tasks/${task.id}`, {
        data: { placement: { listId } },
      });
      expect(patched.status()).toBe(404);
    }

    expect(await readRange()).toEqual(before);
    expect(
      await (await user.client.get(`/api/v1/tasks/${task.id}`)).json(),
    ).toMatchObject({
      title: "Mine",
      date: "2026-11-09",
      notes: "Keep",
      checklist: [{ id: item, text: "One", completed: false }],
    });
  } finally {
    await user.close();
    await other.close();
  }
});

test("HTTP errors share one safe JSON envelope", async ({
  browser,
  baseURL,
}) => {
  const user = await newApiUser(browser, baseURL!);
  type Envelope = { error: { code: string; message: string } };
  const expectError = async (
    response: APIResponse,
    status: number,
    code: string,
  ) => {
    expect(response.status()).toBe(status);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = (await response.json()) as Envelope;
    expect(body).toEqual({ error: { code, message: expect.any(String) } });
    expect(Object.keys(body)).toEqual(["error"]);
    expect(Object.keys(body.error).sort()).toEqual(["code", "message"]);
    expect(body.error.message).not.toMatch(
      /select |insert |stack|pg_|drizzle/i,
    );
  };

  try {
    const task = await (
      await user.client.post("/api/v1/tasks", {
        data: { title: "Mine", date: "2026-11-09" },
      })
    ).json();
    const list = await (
      await user.client.post("/api/v1/lists", {
        data: { title: "Ideas" },
      })
    ).json();
    const listTask = await (
      await user.client.post("/api/v1/tasks", {
        data: { title: "Idea", listId: list.id },
      })
    ).json();

    await expectError(
      await user.client.fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        data: "{",
      }),
      400,
      "invalid_request",
    );
    await expectError(
      await user.client.post("/api/v1/tasks", {
        data: { title: "   ", date: "2026-11-09" },
      }),
      400,
      "invalid_request",
    );
    await expectError(
      await user.client.post("/api/v1/tasks", {
        data: { title: "Never", date: "2026-02-30" },
      }),
      400,
      "invalid_request",
    );
    await expectError(
      await user.client.patch(`/api/v1/tasks/${task.id}`, {
        data: { placement: { date: "2026-11-09", listId: list.id } },
      }),
      400,
      "invalid_request",
    );
    await expectError(
      await user.client.patch(`/api/v1/tasks/${task.id}?scope=everyone`, {
        data: { title: "Renamed" },
      }),
      400,
      "invalid_request",
    );
    await expectError(
      await user.client.get(
        "/api/v1/tasks?from=2026-11-09&from=2026-11-09&to=2026-11-12",
      ),
      400,
      "invalid_request",
    );
    await expectError(
      await user.client.fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        data: JSON.stringify({ title: "Text", date: "2026-11-09" }),
      }),
      415,
      "unsupported_media_type",
    );
    await expectError(
      await user.client.patch(`/api/v1/tasks/${listTask.id}`, {
        data: { repeat: { every: "day", interval: 1, until: null } },
      }),
      400,
      "invalid_request",
    );
    expect(
      await (await user.client.get(`/api/v1/tasks/${listTask.id}`)).json(),
    ).toMatchObject({ title: "Idea", listId: list.id });
    expect(
      await (await user.client.get(`/api/v1/tasks/${listTask.id}`)).json(),
    ).not.toHaveProperty("recurrence");

    const repeated = crypto.randomUUID();
    await expectError(
      await user.client.patch(`/api/v1/tasks/${task.id}`, {
        data: {
          checklist: [
            { id: repeated, text: "One", completed: false },
            { id: repeated, text: "Two", completed: false },
          ],
        },
      }),
      409,
      "conflict",
    );
    expect(
      (await (await user.client.get(`/api/v1/tasks/${task.id}`)).json())
        .checklist,
    ).toEqual([]);

    await expectError(
      await user.client.get("/api/v1/nowhere"),
      404,
      "not_found",
    );
    const notAllowed = await user.client.fetch("/api/v1/tasks", {
      method: "PUT",
      data: {},
    });
    await expectError(notAllowed, 405, "method_not_allowed");
    expect(notAllowed.headers().allow).toContain("GET");
    expect(notAllowed.headers().allow).toContain("POST");
    await expectError(
      await user.client.fetch("/api/v1/tasks", { method: "OPTIONS" }),
      405,
      "method_not_allowed",
    );
  } finally {
    await user.close();
  }
});

test("OpenAPI operations and HTTP dispatch agree", async ({
  browser,
  baseURL,
  request,
}) => {
  const user = await newApiUser(browser, baseURL!);
  const document = await (await request.get("/api/v1/openapi.json")).json();
  type JsonSchema = {
    type?: string;
    oneOf?: JsonSchema[];
    items?: JsonSchema;
    required?: string[];
    properties?: Record<string, unknown>;
    additionalProperties?: boolean;
  };
  const matches = (schema: JsonSchema, value: unknown): boolean => {
    if (schema.oneOf)
      return schema.oneOf.some((branch) => matches(branch, value));
    if (schema.type === "array")
      return (
        Array.isArray(value) &&
        value.every((item) => matches(schema.items!, item))
      );
    if (schema.type === "string") return typeof value === "string";
    if (schema.type === "boolean") return typeof value === "boolean";
    if (schema.type === "integer") return Number.isInteger(value);
    if (schema.type === "number") return typeof value === "number";
    if (schema.type === "object" || schema.properties) {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
      const record = value as Record<string, unknown>;
      if (!(schema.required ?? []).every((key) => key in record)) return false;
      return (
        schema.additionalProperties !== false ||
        Object.keys(record).every((key) => key in (schema.properties ?? {}))
      );
    }
    return true;
  };

  try {
    let task: { id: string } | undefined;
    let list: { id: string } | undefined;
    const cases: {
      method: string;
      path: string;
      url: string;
      status: number;
      call: () => Promise<APIResponse>;
    }[] = [
      {
        method: "get",
        path: "/tasks",
        url: "/api/v1/tasks?from=2026-11-09&to=2026-11-09",
        status: 200,
        call: () =>
          user.client.get("/api/v1/tasks?from=2026-11-09&to=2026-11-09"),
      },
      {
        method: "post",
        path: "/tasks",
        url: "/api/v1/tasks",
        status: 201,
        call: async () => {
          const response = await user.client.post("/api/v1/tasks", {
            data: { title: "Documented", date: "2026-11-09" },
          });
          task = (await response.json()) as { id: string };
          return response;
        },
      },
      {
        method: "get",
        path: "/tasks/{id}",
        url: "/api/v1/tasks/{id}",
        status: 200,
        call: () => user.client.get(`/api/v1/tasks/${task!.id}`),
      },
      {
        method: "patch",
        path: "/tasks/{id}",
        url: "/api/v1/tasks/{id}",
        status: 200,
        call: () =>
          user.client.patch(`/api/v1/tasks/${task!.id}`, {
            data: { notes: "Edited" },
          }),
      },
      {
        method: "post",
        path: "/tasks/{id}/complete",
        url: "/api/v1/tasks/{id}/complete",
        status: 200,
        call: () => user.client.post(`/api/v1/tasks/${task!.id}/complete`),
      },
      {
        method: "post",
        path: "/tasks/{id}/uncomplete",
        url: "/api/v1/tasks/{id}/uncomplete",
        status: 200,
        call: () => user.client.post(`/api/v1/tasks/${task!.id}/uncomplete`),
      },
      {
        method: "post",
        path: "/tasks/{id}/move",
        url: "/api/v1/tasks/{id}/move",
        status: 200,
        call: () =>
          user.client.post(`/api/v1/tasks/${task!.id}/move`, {
            data: { date: "2026-11-10" },
          }),
      },
      {
        method: "get",
        path: "/lists",
        url: "/api/v1/lists",
        status: 200,
        call: () => user.client.get("/api/v1/lists"),
      },
      {
        method: "post",
        path: "/lists",
        url: "/api/v1/lists",
        status: 201,
        call: async () => {
          const response = await user.client.post("/api/v1/lists", {
            data: { title: "Documented" },
          });
          list = (await response.json()) as { id: string };
          return response;
        },
      },
      {
        method: "patch",
        path: "/lists/{id}",
        url: "/api/v1/lists/{id}",
        status: 200,
        call: () =>
          user.client.patch(`/api/v1/lists/${list!.id}`, {
            data: { title: "Renamed" },
          }),
      },
      {
        method: "post",
        path: "/lists/{id}/move",
        url: "/api/v1/lists/{id}/move",
        status: 204,
        call: () =>
          user.client.post(`/api/v1/lists/${list!.id}/move`, {
            data: { to: 0 },
          }),
      },
      {
        method: "delete",
        path: "/lists/{id}",
        url: "/api/v1/lists/{id}",
        status: 204,
        call: () => user.client.delete(`/api/v1/lists/${list!.id}`),
      },
      {
        method: "delete",
        path: "/tasks/{id}",
        url: "/api/v1/tasks/{id}",
        status: 204,
        call: () => user.client.delete(`/api/v1/tasks/${task!.id}`),
      },
    ];

    expect(cases).toHaveLength(13);
    for (const each of cases) {
      const operation = document.paths[each.path]?.[each.method];
      expect(operation, `${each.method} ${each.path}`).toBeDefined();
      const declared = operation.responses[String(each.status)];
      expect(
        declared,
        `${each.method} ${each.path} ${each.status}`,
      ).toBeDefined();

      const response = await each.call();
      expect(response.status(), `${each.method} ${each.path}`).toBe(
        each.status,
      );
      if (each.status === 204) {
        expect(await response.text()).toBe("");
        continue;
      }
      expect(response.headers()["content-type"]).toContain("application/json");
      const schema = declared.content["application/json"].schema as JsonSchema;
      expect(
        matches(schema, await response.json()),
        `${each.method} ${each.path}`,
      ).toBe(true);
    }
  } finally {
    await user.close();
  }
});

test("revocation takes effect on the next HTTP request", async ({
  browser,
  baseURL,
  request,
}) => {
  const user = await newApiUser(browser, baseURL!);
  try {
    const second = await issueApiToken(user.page, "Second");

    expect((await user.client.get("/api/v1/lists")).status()).toBe(200);
    expect(
      (
        await user.client.post("/api/v1/tasks", {
          data: { title: "Before revocation", date: "2026-11-09" },
        })
      ).status(),
    ).toBe(201);

    await user.page.getByRole("button", { name: "Revoke Agent" }).click();
    await expect(
      user.page.getByRole("button", { name: "Revoke Agent" }),
    ).toHaveCount(0);
    await expect(user.page.getByRole("row", { name: /Second/ })).toBeVisible();

    expect((await user.client.get("/api/v1/lists")).status()).toBe(401);
    expect(
      (
        await user.client.post("/api/v1/tasks", {
          data: { title: "After revocation", date: "2026-11-09" },
        })
      ).status(),
    ).toBe(401);

    const allowed = await request.get("/api/v1/lists", {
      headers: { Authorization: `Bearer ${second}` },
    });
    expect(allowed.status()).toBe(200);

    await user.page.reload();
    await expect(user.page.getByRole("row", { name: /Agent/ })).toHaveCount(0);
    await expect(user.page.getByRole("row", { name: /Second/ })).toBeVisible();
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

    await user.page.getByRole("button", { name: "Revoke Agent" }).click();
    await expect(
      user.page.getByRole("button", { name: "Revoke Agent" }),
    ).toHaveCount(0);
    expect((await user.client.get("/api/v1/lists")).status()).toBe(401);

    expect((await request.get("/api/v1/openapi.json")).status()).toBe(200);
  } finally {
    await user.close();
  }
});
