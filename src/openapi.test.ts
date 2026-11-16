import { expect, test } from "vitest";
import { z } from "zod";
import { apiErrorResult } from "./api-errors";
import { createOpenApiDocument } from "./openapi";
import { isoDate, occurrenceId, repeat } from "./planner-schemas";

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(json).filter(([key]) => key !== "$schema"),
  );
}

function oneOf(schema: unknown): unknown[] {
  if (typeof schema !== "object" || schema === null) return [];
  const record = schema as Record<string, unknown>;
  if (Array.isArray(record.oneOf)) return record.oneOf;
  for (const value of Object.values(record)) {
    const found = oneOf(value);
    if (found.length) return found;
  }
  return [];
}

test("OpenAPI is generated from the shared planner schemas", () => {
  const document = createOpenApiDocument();

  expect(document.openapi).toBe("3.1.0");
  expect(document.info).toMatchObject({
    title: "YourWeek API",
    version: "1.0.0",
  });
  expect(document.servers).toEqual([{ url: "/api/v1" }]);
  expect(document.components?.securitySchemes?.bearerAuth).toMatchObject({
    type: "http",
    scheme: "bearer",
  });
  expect(document.security).toEqual([{ bearerAuth: [] }]);

  const operations = [
    ["get", "/tasks"],
    ["post", "/tasks"],
    ["get", "/tasks/{id}"],
    ["patch", "/tasks/{id}"],
    ["delete", "/tasks/{id}"],
    ["post", "/tasks/{id}/complete"],
    ["post", "/tasks/{id}/uncomplete"],
    ["post", "/tasks/{id}/move"],
    ["get", "/lists"],
    ["post", "/lists"],
    ["patch", "/lists/{id}"],
    ["delete", "/lists/{id}"],
    ["post", "/lists/{id}/move"],
  ] as const;
  for (const [method, path] of operations)
    expect(document.paths?.[path]?.[method]).toBeDefined();

  const parameters = document.paths!["/tasks"].get!.parameters as {
    name: string;
    schema: unknown;
  }[];
  expect(parameters.map((parameter) => parameter.name).sort()).toEqual([
    "completed",
    "from",
    "listId",
    "q",
    "to",
  ]);
  expect(
    parameters.find((parameter) => parameter.name === "from")?.schema,
  ).toEqual(jsonSchema(isoDate));
  expect(
    parameters.find((parameter) => parameter.name === "to")?.schema,
  ).toEqual(jsonSchema(isoDate));
  expect(
    parameters.find((parameter) => parameter.name === "completed")?.schema,
  ).toMatchObject({ enum: ["true", "false"] });
  expect(
    parameters.find((parameter) => parameter.name === "listId")?.schema,
  ).toMatchObject({ format: "uuid" });
  expect(
    parameters.find((parameter) => parameter.name === "q")?.schema,
  ).toMatchObject({ minLength: 1, maxLength: 500 });
  const description = document.paths!["/tasks"].get!.description!;
  expect(description).toContain("never both");
  expect(description).toContain("366");

  const taskIdParameter = document.paths!["/tasks/{id}"].get!.parameters as {
    name: string;
    schema: { anyOf: Record<string, unknown>[] };
  }[];
  expect(
    taskIdParameter.find((parameter) => parameter.name === "id")?.schema.anyOf,
  ).toEqual([
    { type: "string", format: "uuid", pattern: expect.any(String) },
    { type: "string", pattern: occurrenceId.source },
  ]);

  const scopeParameter = document.paths!["/tasks/{id}"].patch!.parameters as {
    name: string;
    schema: unknown;
  }[];
  expect(
    scopeParameter.find((parameter) => parameter.name === "scope")?.schema,
  ).toMatchObject({ default: "this", enum: ["this", "following"] });

  const bodySchema = (requestBody: unknown) =>
    (
      requestBody as {
        content?: Record<string, { schema?: unknown }>;
      }
    ).content?.["application/json"].schema;

  const createBody = bodySchema(document.paths!["/tasks"].post!.requestBody);
  const branches = oneOf(createBody) as {
    properties: Record<string, unknown>;
    required: string[];
  }[];
  expect(branches).toHaveLength(2);
  expect(branches.every((branch) => branch.properties.title)).toBe(true);
  expect(branches.map((branch) => branch.required.join(",")).sort()).toEqual([
    "title,date",
    "title,listId",
  ]);

  const patchBody = bodySchema(
    document.paths!["/tasks/{id}"].patch!.requestBody,
  ) as {
    properties: Record<string, unknown>;
  };
  expect(patchBody.properties.title).toMatchObject({
    minLength: 1,
    maxLength: 500,
  });
  expect(oneOf(patchBody.properties.placement)).toHaveLength(2);
  // why: the API strips unknown body fields, so the document leaves them out rather than forbidding them
  const withoutAdditional = (branches: unknown[]) =>
    branches.map((branch) => {
      const record = { ...(branch as Record<string, unknown>) };
      delete record.additionalProperties;
      return record;
    });
  expect(withoutAdditional(oneOf(patchBody.properties.repeat))).toEqual(
    withoutAdditional(oneOf(jsonSchema(repeat))),
  );

  const taskResult =
    document.paths!["/tasks/{id}"].get!.responses!["200"]!.content![
      "application/json"
    ].schema;
  for (const branch of oneOf(taskResult) as {
    properties: {
      title: unknown;
      checklist: {
        items: { properties: Record<string, unknown>; required: string[] };
      };
    };
  }[]) {
    expect(branch.properties.title).toEqual(
      expect.objectContaining({ minLength: 1, maxLength: 500 }),
    );
    expect(branch.properties.checklist.items.properties).toMatchObject({
      id: { format: "uuid" },
      text: { minLength: 1, maxLength: 500 },
      completed: { type: "boolean" },
    });
  }

  for (const [method, path] of operations) {
    const responses = document.paths?.[path]?.[method]?.responses;
    expect(responses?.["401"]?.content?.["application/json"].schema).toEqual(
      jsonSchema(apiErrorResult),
    );
    expect(responses?.["429"]?.headers).toHaveProperty("Retry-After");
  }
});
