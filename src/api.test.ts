import { afterAll, expect, test } from "vitest";
import { handleApiRequest } from "./api";
import { createApiToken, revokeApiToken } from "./api-tokens";
import { db } from "./db/client";
import { users } from "./db/schema";
import { createList, updateSettings } from "./planner";

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

interface Api {
  userId: string;
  tokenId: string;
  fetch(path: string, init?: RequestInit): Promise<Response>;
  get(path: string): Promise<Response>;
  post(path: string, data?: unknown): Promise<Response>;
  patch(path: string, data?: unknown): Promise<Response>;
  delete(path: string): Promise<Response>;
}

async function newApi(): Promise<Api> {
  const user = await newUser();
  const { token, info } = await createApiToken(user, { name: "Agent" });
  const call = (path: string, init: RequestInit = {}) =>
    handleApiRequest(
      new Request(`${origin}/api/v1${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...init.headers },
      }),
      now,
    );
  const send =
    (method: string) =>
    (path: string, data?: unknown): Promise<Response> =>
      call(path, {
        method,
        body: data === undefined ? undefined : JSON.stringify(data),
        headers: { "content-type": "application/json" },
      });
  return {
    userId: user,
    tokenId: info.id,
    fetch: call,
    get: (path) => call(path),
    post: send("POST"),
    patch: send("PATCH"),
    delete: send("DELETE"),
  };
}

test("the OpenAPI document is served without a token", async () => {
  const document = await handleApiRequest(
    new Request(`${origin}/api/v1/openapi.json`),
    now,
  );

  expect(document.status).toBe(200);
  expect(document.headers.get("content-type")).toContain("application/json");
  const body = await document.json();
  expect(body.openapi).toBe("3.1.0");
  expect(body.paths).toHaveProperty("/tasks");
  expect(body.components.securitySchemes.bearerAuth).toMatchObject({
    type: "http",
    scheme: "bearer",
  });

  const head = await handleApiRequest(
    new Request(`${origin}/api/v1/openapi.json`, { method: "HEAD" }),
    now,
  );
  expect(head.status).toBe(200);
  expect(head.headers.get("content-type")).toContain("application/json");

  const refused = await handleApiRequest(
    new Request(`${origin}/api/v1/openapi.json`, { method: "POST" }),
    now,
  );
  expect(refused.status).toBe(405);
  expect(refused.headers.get("allow")).toBe("GET, HEAD");
});

test("protected routes accept a bearer token and nothing else", async () => {
  const api = await newApi();
  const denied = [
    await handleApiRequest(new Request(`${origin}/api/v1/lists`), now),
    await handleApiRequest(
      new Request(`${origin}/api/v1/lists`, {
        headers: { Authorization: "Bearer yw_short" },
      }),
      now,
    ),
    await handleApiRequest(
      new Request(`${origin}/api/v1/lists`, {
        headers: { Authorization: "Basic dXNlcjpwYXNz" },
      }),
      now,
    ),
    await handleApiRequest(
      new Request(`${origin}/api/v1/lists`, {
        headers: { Cookie: "better-auth.session_token=whatever" },
      }),
      now,
    ),
  ];
  const bodies: unknown[] = [];
  for (const response of denied) {
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(response.headers.get("cache-control")).toContain("no-store");
    bodies.push(await response.json());
  }
  for (const body of bodies)
    expect(body).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
  expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);

  const allowed = await api.get("/lists");
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get("cache-control")).toContain("no-store");
  expect(await allowed.json()).toEqual([
    { id: expect.any(String), title: "Inbox" },
  ]);

  const head = await api.fetch("/lists", { method: "HEAD" });
  expect(head.status).toBe(200);
});

test("a task completes its full lifecycle", async () => {
  const api = await newApi();

  const created = await api.post("/tasks", {
    title: "Buy milk",
    date: "2026-11-09",
  });
  expect(created.status).toBe(201);
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
  expect(created.headers.get("location")).toBe(`/api/v1/tasks/${task.id}`);

  const read = await api.get(`/tasks/${task.id}`);
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual(task);

  const item = crypto.randomUUID();
  const patched = await api.patch(`/tasks/${task.id}`, {
    title: "Buy oat milk",
    notes: "Cold",
    color: "green",
    checklist: [{ id: item, text: "Oat", completed: true }],
  });
  expect(patched.status).toBe(200);
  expect(await patched.json()).toMatchObject({
    id: task.id,
    title: "Buy oat milk",
    notes: "Cold",
    color: "green",
    checklist: [{ id: item, text: "Oat", completed: true }],
    date: "2026-11-09",
  });

  expect((await api.post(`/tasks/${task.id}/complete`)).status).toBe(200);
  expect(await (await api.get(`/tasks/${task.id}`)).json()).toMatchObject({
    completed: true,
  });
  expect((await api.post(`/tasks/${task.id}/uncomplete`)).status).toBe(200);
  expect(await (await api.get(`/tasks/${task.id}`)).json()).toMatchObject({
    completed: false,
  });

  const second = await (
    await api.post("/tasks", { title: "Second", date: "2026-11-11" })
  ).json();
  const moved = await api.post(`/tasks/${task.id}/move`, {
    date: "2026-11-11",
    index: 0,
  });
  expect(moved.status).toBe(200);
  expect(await moved.json()).toMatchObject({
    id: task.id,
    date: "2026-11-11",
  });

  const listed = await api.get("/tasks?from=2026-11-09&to=2026-11-11");
  expect(listed.status).toBe(200);
  expect(
    (await listed.json()).map((each: { title: string }) => each.title),
  ).toEqual(["Buy oat milk", "Second"]);

  const deleted = await api.delete(`/tasks/${task.id}`);
  expect(deleted.status).toBe(204);
  expect((await api.get(`/tasks/${task.id}`)).status).toBe(404);
  expect((await api.get(`/tasks/${second.id}`)).status).toBe(200);
});

test("lists and their tasks are managed over the API", async () => {
  const api = await newApi();

  const first = await (await api.post("/lists", { title: "Errands" })).json();
  const second = await (await api.post("/lists", { title: "Reading" })).json();
  expect(first).toEqual({ id: expect.any(String), title: "Errands" });
  expect(
    (await api.patch(`/lists/${first.id}`, { title: "Chores" })).status,
  ).toBe(200);

  expect((await api.post(`/lists/${second.id}/move`, { to: 0 })).status).toBe(
    204,
  );
  expect((await api.post(`/lists/${first.id}/move`, { to: 1 })).status).toBe(
    204,
  );
  expect(
    (await (await api.get("/lists")).json()).map(
      (list: { title: string }) => list.title,
    ),
  ).toEqual(["Reading", "Chores", "Inbox"]);

  const inList = await (
    await api.post("/tasks", { title: "Dune", listId: second.id })
  ).json();
  expect(inList).toMatchObject({ title: "Dune", listId: second.id });

  const dated = await (
    await api.post("/tasks", { title: "Milk", date: "2026-11-09" })
  ).json();
  expect(
    await (
      await api.post(`/tasks/${dated.id}/move`, { listId: second.id })
    ).json(),
  ).toMatchObject({ id: dated.id, listId: second.id });

  const listed = await api.get(`/tasks?listId=${second.id}`);
  expect(listed.status).toBe(200);
  expect(
    (await listed.json()).map((task: { title: string }) => task.title),
  ).toEqual(["Dune", "Milk"]);

  expect(
    await (
      await api.post(`/tasks/${dated.id}/move`, { date: "2026-11-10" })
    ).json(),
  ).toMatchObject({ id: dated.id, date: "2026-11-10" });

  expect((await api.delete(`/lists/${second.id}`)).status).toBe(204);
  expect((await api.get(`/tasks/${inList.id}`)).status).toBe(404);
  expect(
    (await (await api.get("/lists")).json()).map(
      (list: { title: string }) => list.title,
    ),
  ).toEqual(["Chores", "Inbox"]);

  expect((await api.delete(`/lists/${first.id}`)).status).toBe(204);
  expect((await api.delete("/lists/not-a-uuid")).status).toBe(400);
  const [inbox] = (await (await api.get("/lists")).json()) as { id: string }[];
  const refused = await api.delete(`/lists/${inbox.id}`);
  expect(refused.status).toBe(409);
  expect(await refused.json()).toEqual({
    error: { code: "conflict", message: "Cannot delete the last list" },
  });
  expect((await api.get("/lists")).status).toBe(200);
  expect((await (await api.get("/lists")).json()).length).toBe(1);
});

test("task queries filter a date range and list by status and text", async () => {
  const api = await newApi();
  const list = await (await api.post("/lists", { title: "Ideas" })).json();
  const create = async (data: Record<string, unknown>) =>
    (await api.post("/tasks", data)).json();

  const range = await create({ title: "Range", date: "2026-11-09" });
  const also = await create({ title: "Also", date: "2026-11-11" });
  const outside = await create({ title: "Outside", date: "2026-11-12" });
  const done = await create({ title: "Done", date: "2026-11-10" });
  await api.post(`/tasks/${done.id}/complete`);
  const noted = await create({ title: "Noted", date: "2026-11-10" });
  await api.patch(`/tasks/${noted.id}`, { notes: "Buy 50% milk" });
  const literal = await create({ title: "Buy 50 milk", date: "2026-11-10" });
  await create({ title: "Plan_A", date: "2026-11-10" });
  await create({ title: "Plan A", date: "2026-11-10" });
  const listed = await create({ title: "Listed", listId: list.id });

  const titles = async (url: string) => {
    const response = await api.get(url);
    expect(response.status).toBe(200);
    return ((await response.json()) as { title: string }[]).map(
      (task) => task.title,
    );
  };

  const both = await titles("/tasks?from=2026-11-09&to=2026-11-11");
  expect(both).toContain(range.title);
  expect(both).toContain(also.title);
  expect(both).not.toContain(outside.title);
  expect(both).not.toContain(listed.title);

  const open = await titles(
    "/tasks?from=2026-11-09&to=2026-11-11&completed=false",
  );
  expect(open).not.toContain(done.title);
  expect(open).toContain(noted.title);

  expect(
    await titles(
      `/tasks?from=2026-11-09&to=2026-11-11&q=${encodeURIComponent("MILK")}`,
    ),
  ).toEqual([noted.title, literal.title]);
  expect(
    await titles(
      `/tasks?from=2026-11-09&to=2026-11-11&q=${encodeURIComponent("%")}`,
    ),
  ).toEqual([noted.title]);
  expect(
    await titles(
      `/tasks?from=2026-11-09&to=2026-11-11&q=${encodeURIComponent("_")}`,
    ),
  ).toEqual(["Plan_A"]);
  expect(await titles(`/tasks?listId=${list.id}`)).toEqual([listed.title]);

  for (const url of [
    "/tasks?from=2026-11-09",
    "/tasks?from=2026-11-09&to=2026-11-11&listId=" + list.id,
    "/tasks?from=2026-11-12&to=2026-11-09",
    "/tasks?listId=" + list.id + "&completed=anything",
    "/tasks?from=2026-11-09&to=2026-11-11&unknown=1",
    "/tasks?from=2026-11-09&from=2026-11-10&to=2026-11-11",
  ]) {
    const response = await api.get(url);
    expect(response.status, url).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_request", message: expect.any(String) },
    });
  }
});

test("the API exposes virtual occurrences and this-or-following edits", async () => {
  const api = await newApi();
  type ApiTask = {
    id: string;
    title: string;
    completed: boolean;
    date: string;
    recurrence?: { seriesId: string; occurrence: string };
  };
  const range = async (from: string, to: string) =>
    (await (await api.get(`/tasks?from=${from}&to=${to}`)).json()) as ApiTask[];

  const seed = await (
    await api.post("/tasks", { title: "Seed", date: "2026-11-10" })
  ).json();
  expect(
    (
      await api.patch(`/tasks/${seed.id}`, {
        repeat: { every: "day", interval: 1, until: "2026-11-14" },
      })
    ).status,
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
  const read = await api.get(`/tasks/${twelve.id}`);
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual(twelve);

  expect((await api.post(`/tasks/${five[1].id}/complete`)).status).toBe(200);
  expect(
    (await range("2026-11-10", "2026-11-14"))
      .filter((task) => task.completed)
      .map((task) => task.date),
  ).toEqual(["2026-11-11"]);

  expect(
    (
      await api.patch(`/tasks/${five[3].id}?scope=following`, {
        title: "Changed",
      })
    ).status,
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
      await api.post(`/tasks/${fourteen.id}/move`, {
        date: "2026-11-15",
      })
    ).status,
  ).toBe(200);
  expect(
    (await range("2026-11-10", "2026-11-14")).map((task) => task.date),
  ).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  expect(await range("2026-11-15", "2026-11-15")).toMatchObject([
    { date: "2026-11-15", recurrence: { occurrence: "2026-11-14" } },
  ]);

  expect((await api.delete(`/tasks/${twelve.id}?scope=this`)).status).toBe(204);
  expect(
    (await range("2026-11-10", "2026-11-14")).map((task) => task.date),
  ).toEqual(["2026-11-10", "2026-11-11", "2026-11-13"]);
  expect((await api.get(`/tasks/${twelve.id}`)).status).toBe(404);
  expect(
    (await range("2026-11-10", "2026-11-14")).map((task) => task.id),
  ).not.toContain(twelve.id);

  expect(
    (await api.delete(`/tasks/${five[3].id}?scope=following`)).status,
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
});

test("date reads roll overdue tasks and missed occurrences to the owner's today", async () => {
  const api = await newApi();

  await api.post("/tasks", { title: "Overdue", date: "2026-11-08" });
  const series = await (
    await api.post("/tasks", { title: "Series", date: "2026-11-07" })
  ).json();
  await api.patch(`/tasks/${series.id}`, {
    repeat: { every: "day", interval: 1, until: "2026-11-09" },
  });
  await api.post("/tasks", { title: "Future", date: "2026-11-10" });

  const read = async () =>
    (await (await api.get("/tasks?from=2026-11-09&to=2026-11-10")).json()) as {
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
});

test("another user's resources are indistinguishable from missing resources", async () => {
  const owner = await newApi();
  const other = await newApi();
  type ApiTask = { id: string; date: string; title: string };
  const snapshot = async () => ({
    lists: await (await owner.get("/lists")).json(),
    tasks: await (
      await owner.get("/tasks?from=2026-11-09&to=2026-11-12")
    ).json(),
  });
  const missing = async (
    foreign: Promise<Response>,
    absent: Promise<Response>,
  ) => {
    const [one, two] = await Promise.all([foreign, absent]);
    expect(one.status).toBe(404);
    expect(two.status).toBe(404);
    expect(await one.json()).toEqual(await two.json());
  };

  const list = await (await owner.post("/lists", { title: "Private" })).json();
  const plain = await (
    await owner.post("/tasks", { title: "Secret", date: "2026-11-09" })
  ).json();
  const recurring = await (
    await owner.post("/tasks", { title: "Repeat", date: "2026-11-09" })
  ).json();
  await owner.patch(`/tasks/${recurring.id}`, {
    repeat: { every: "day", interval: 1, until: null },
  });
  const occurrences = (await (
    await owner.get("/tasks?from=2026-11-09&to=2026-11-12")
  ).json()) as ApiTask[];
  const virtual = occurrences.find((task) => task.date === "2026-11-11")!;
  const absent = crypto.randomUUID();
  const before = await snapshot();

  await missing(other.get(`/tasks/${plain.id}`), other.get(`/tasks/${absent}`));
  await missing(
    other.patch(`/tasks/${plain.id}`, { title: "Hacked" }),
    other.patch(`/tasks/${absent}`, { title: "Hacked" }),
  );
  await missing(
    other.delete(`/tasks/${plain.id}`),
    other.delete(`/tasks/${absent}`),
  );
  for (const action of ["complete", "uncomplete"]) {
    await missing(
      other.post(`/tasks/${plain.id}/${action}`),
      other.post(`/tasks/${absent}/${action}`),
    );
    await missing(
      other.post(`/tasks/${virtual.id}/${action}`),
      other.post(`/tasks/${absent}/${action}`),
    );
  }
  await missing(
    other.get(`/tasks/${virtual.id}`),
    other.get(`/tasks/${absent}`),
  );
  await missing(
    other.patch(`/tasks/${virtual.id}`, { title: "Hacked" }),
    other.patch(`/tasks/${absent}`, { title: "Hacked" }),
  );
  await missing(
    other.delete(`/tasks/${virtual.id}`),
    other.delete(`/tasks/${absent}`),
  );
  await missing(
    other.post(`/tasks/${virtual.id}/move`, { date: "2026-11-12" }),
    other.post(`/tasks/${absent}/move`, { date: "2026-11-12" }),
  );
  await missing(
    other.patch(`/lists/${list.id}`, { title: "Hacked" }),
    other.patch(`/lists/${absent}`, { title: "Hacked" }),
  );
  await missing(
    other.post(`/lists/${list.id}/move`, { to: 0 }),
    other.post(`/lists/${absent}/move`, { to: 0 }),
  );
  await missing(
    other.delete(`/lists/${list.id}`),
    other.delete(`/lists/${absent}`),
  );
  await missing(
    other.get(`/tasks?listId=${list.id}`),
    other.get(`/tasks?listId=${absent}`),
  );

  expect(await snapshot()).toEqual(before);
  expect((await (await other.get("/lists")).json()).length).toBe(1);
  expect(
    await (await other.get("/tasks?from=2026-11-09&to=2026-11-12")).json(),
  ).toEqual([]);
});

test("foreign and missing destination lists return 404 without partial writes", async () => {
  const user = await newApi();
  const other = await newApi();
  const foreign = await (
    await other.post("/lists", { title: "Theirs" })
  ).json();
  const random = crypto.randomUUID();
  const task = await (
    await user.post("/tasks", { title: "Mine", date: "2026-11-09" })
  ).json();
  const item = crypto.randomUUID();
  await user.patch(`/tasks/${task.id}`, {
    notes: "Keep",
    checklist: [{ id: item, text: "One", completed: false }],
  });
  const readRange = async () =>
    await (await user.get("/tasks?from=2026-11-09&to=2026-11-09")).json();
  const before = await readRange();

  for (const listId of [foreign.id, random]) {
    const created = await user.post("/tasks", { title: "New", listId });
    expect(created.status).toBe(404);
    expect(await created.json()).toEqual({
      error: { code: "not_found", message: "Resource not found" },
    });

    const moved = await user.post(`/tasks/${task.id}/move`, { listId });
    expect(moved.status).toBe(404);

    const patched = await user.patch(`/tasks/${task.id}`, {
      placement: { listId },
    });
    expect(patched.status).toBe(404);
  }

  expect(await readRange()).toEqual(before);
  expect(await (await user.get(`/tasks/${task.id}`)).json()).toMatchObject({
    title: "Mine",
    date: "2026-11-09",
    notes: "Keep",
    checklist: [{ id: item, text: "One", completed: false }],
  });
});

test("errors share one safe JSON envelope", async () => {
  const api = await newApi();
  type Envelope = { error: { code: string; message: string } };
  const expectError = async (
    response: Response,
    status: number,
    code: string,
  ) => {
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = (await response.json()) as Envelope;
    expect(body).toEqual({ error: { code, message: expect.any(String) } });
    expect(Object.keys(body)).toEqual(["error"]);
    expect(Object.keys(body.error).sort()).toEqual(["code", "message"]);
    expect(body.error.message).not.toMatch(
      /select |insert |stack|pg_|drizzle/i,
    );
  };

  const task = await (
    await api.post("/tasks", { title: "Mine", date: "2026-11-09" })
  ).json();
  const list = await (await api.post("/lists", { title: "Ideas" })).json();
  const listTask = await (
    await api.post("/tasks", { title: "Idea", listId: list.id })
  ).json();

  await expectError(
    await api.fetch("/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
    400,
    "invalid_request",
  );
  await expectError(
    await api.post("/tasks", { title: "Never", date: "2026-02-30" }),
    400,
    "invalid_request",
  );
  const blank = await api.post("/tasks", { title: "   ", date: "2026-11-09" });
  expect(blank.status).toBe(400);
  expect(await blank.json()).toEqual({
    error: { code: "invalid_request", message: "Invalid request" },
  });
  await expectError(
    await api.patch(`/tasks/${task.id}`, {
      placement: { date: "2026-11-09", listId: list.id },
    }),
    400,
    "invalid_request",
  );
  await expectError(
    await api.patch(`/tasks/${task.id}?scope=everyone`, { title: "Renamed" }),
    400,
    "invalid_request",
  );
  await expectError(
    await api.get("/tasks?from=2026-11-09&from=2026-11-09&to=2026-11-12"),
    400,
    "invalid_request",
  );
  await expectError(
    await api.fetch("/tasks", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ title: "Text", date: "2026-11-09" }),
    }),
    415,
    "unsupported_media_type",
  );
  await expectError(
    await api.patch(`/tasks/${listTask.id}`, {
      repeat: { every: "day", interval: 1, until: null },
    }),
    400,
    "invalid_request",
  );
  expect(await (await api.get(`/tasks/${listTask.id}`)).json()).toMatchObject({
    title: "Idea",
    listId: list.id,
  });
  expect(
    await (await api.get(`/tasks/${listTask.id}`)).json(),
  ).not.toHaveProperty("recurrence");

  const repeated = crypto.randomUUID();
  await expectError(
    await api.patch(`/tasks/${task.id}`, {
      checklist: [
        { id: repeated, text: "One", completed: false },
        { id: repeated, text: "Two", completed: false },
      ],
    }),
    409,
    "conflict",
  );
  expect((await (await api.get(`/tasks/${task.id}`)).json()).checklist).toEqual(
    [],
  );

  await expectError(await api.get("/nowhere"), 404, "not_found");
  const notAllowed = await api.fetch("/tasks", { method: "PUT" });
  await expectError(notAllowed, 405, "method_not_allowed");
  expect(notAllowed.headers.get("allow")).toContain("GET");
  expect(notAllowed.headers.get("allow")).toContain("POST");
  await expectError(
    await api.fetch("/tasks", { method: "OPTIONS" }),
    405,
    "method_not_allowed",
  );
});

test("the router serves exactly the paths and methods of the OpenAPI document", async () => {
  const api = await newApi();
  const document = (await (await api.get("/openapi.json")).json()) as {
    paths: Record<
      string,
      Record<string, { responses: Record<string, unknown> }>
    >;
  };
  // why: HEAD is the one implicit method — the router answers it like GET — so only these count as undocumented
  const allMethods = ["get", "post", "patch", "delete", "put", "options"];

  let task: { id: string } | undefined;
  let list: { id: string } | undefined;
  const documented: {
    method: string;
    path: string;
    status: number;
    call: () => Promise<Response>;
  }[] = [
    {
      method: "get",
      path: "/tasks",
      status: 200,
      call: () => api.get("/tasks?from=2026-11-09&to=2026-11-09"),
    },
    {
      method: "post",
      path: "/tasks",
      status: 201,
      call: async () => {
        const response = await api.post("/tasks", {
          title: "Documented",
          date: "2026-11-09",
        });
        task = await response.clone().json();
        return response;
      },
    },
    {
      method: "get",
      path: "/tasks/{id}",
      status: 200,
      call: () => api.get(`/tasks/${task!.id}`),
    },
    {
      method: "patch",
      path: "/tasks/{id}",
      status: 200,
      call: () => api.patch(`/tasks/${task!.id}`, { notes: "Edited" }),
    },
    {
      method: "post",
      path: "/tasks/{id}/complete",
      status: 200,
      call: () => api.post(`/tasks/${task!.id}/complete`),
    },
    {
      method: "post",
      path: "/tasks/{id}/uncomplete",
      status: 200,
      call: () => api.post(`/tasks/${task!.id}/uncomplete`),
    },
    {
      method: "post",
      path: "/tasks/{id}/move",
      status: 200,
      call: () => api.post(`/tasks/${task!.id}/move`, { date: "2026-11-10" }),
    },
    {
      method: "get",
      path: "/lists",
      status: 200,
      call: () => api.get("/lists"),
    },
    {
      method: "post",
      path: "/lists",
      status: 201,
      call: async () => {
        const response = await api.post("/lists", { title: "Documented" });
        list = await response.clone().json();
        return response;
      },
    },
    {
      method: "patch",
      path: "/lists/{id}",
      status: 200,
      call: () => api.patch(`/lists/${list!.id}`, { title: "Renamed" }),
    },
    {
      method: "post",
      path: "/lists/{id}/move",
      status: 204,
      call: () => api.post(`/lists/${list!.id}/move`, { to: 0 }),
    },
    {
      method: "delete",
      path: "/lists/{id}",
      status: 204,
      call: () => api.delete(`/lists/${list!.id}`),
    },
    {
      method: "delete",
      path: "/tasks/{id}",
      status: 204,
      call: () => api.delete(`/tasks/${task!.id}`),
    },
  ];

  const operations = Object.entries(document.paths).flatMap(([path, item]) =>
    Object.keys(item).map((method) => `${method} ${path}`),
  );
  expect(operations.sort()).toEqual(
    documented.map((each) => `${each.method} ${each.path}`).sort(),
  );

  for (const each of documented) {
    const operation = document.paths[each.path][each.method];
    expect(operation, `${each.method} ${each.path}`).toBeDefined();
    const response = await each.call();
    expect(response.status, `${each.method} ${each.path}`).toBe(each.status);
    expect(
      operation.responses[String(each.status)],
      `${each.method} ${each.path} ${each.status}`,
    ).toBeDefined();
    if (each.status === 204) expect(await response.text()).toBe("");
    else
      expect(
        response.headers.get("content-type"),
        `${each.method} ${each.path}`,
      ).toContain("application/json");
  }

  const concrete = (path: string) =>
    path.replace("{id}", path.startsWith("/lists") ? list!.id : task!.id);
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of allMethods) {
      if (item[method]) continue;
      const response = await api.fetch(concrete(path), {
        method: method.toUpperCase(),
      });
      expect(response.status, `${method.toUpperCase()} ${path}`).toBe(405);
      expect(response.headers.get("allow"), `${method} ${path}`).toBeTruthy();
    }
  }

  const taskId = crypto.randomUUID();
  for (const path of [
    "/nowhere",
    `/tasks/${taskId}/archive`,
    `/lists/${taskId}/archive`,
  ]) {
    for (const method of ["GET", "POST"]) {
      const response = await api.fetch(path, { method });
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "not_found", message: "Resource not found" },
      });
    }
  }
});

test("revocation takes effect on the next request", async () => {
  const api = await newApi();

  expect((await api.get("/lists")).status).toBe(200);
  expect(
    (
      await api.post("/tasks", {
        title: "Before revocation",
        date: "2026-11-09",
      })
    ).status,
  ).toBe(201);

  const second = (await createApiToken(api.userId, { name: "Second" })).token;
  expect(await revokeApiToken(api.userId, api.tokenId)).toBe(true);

  expect((await api.get("/lists")).status).toBe(401);
  expect(
    (
      await api.post("/tasks", {
        title: "After revocation",
        date: "2026-11-09",
      })
    ).status,
  ).toBe(401);

  const allowed = await handleApiRequest(
    new Request(`${origin}/api/v1/lists`, {
      headers: { Authorization: `Bearer ${second}` },
    }),
    now,
  );
  expect(allowed.status).toBe(200);
});
