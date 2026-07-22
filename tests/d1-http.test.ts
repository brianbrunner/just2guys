import { describe, expect, it } from "vitest";

import { D1HttpDatabase } from "../server/db/http";

function response(results: Array<Record<string, unknown>> = []) {
  return Response.json({
    success: true,
    result: [{ success: true, results, meta: { changes: 1 } }],
    errors: [],
    messages: [],
  });
}

describe("D1 HTTP fallback adapter", () => {
  it("uses bound parameters without exposing the API token in the request body", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      requests.push({ url, init });
      return Promise.resolve(response([{ value: "ok" }]));
    };
    const database = new D1HttpDatabase(
      "account",
      "database",
      "private-token",
      fetcher,
    );

    await expect(
      database.prepare("SELECT ? value").bind("ok").first("value"),
    ).resolves.toBe("ok");
    expect(requests[0]?.url).toContain(
      "/accounts/account/d1/database/database/query",
    );
    expect(requests[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer private-token",
    });
    expect(requests[0]?.init?.body).toBe(
      JSON.stringify({ sql: "SELECT ? value", params: ["ok"] }),
    );
    const requestBody = requests[0]?.init?.body;
    expect(typeof requestBody).toBe("string");
    if (typeof requestBody !== "string") throw new Error("Missing JSON body");
    expect(requestBody).not.toContain("private-token");
  });

  it("sends prepared statements through the documented batch request shape", async () => {
    let body: unknown;
    const fetcher: typeof fetch = (_input, init) => {
      if (typeof init?.body !== "string") throw new Error("Missing JSON body");
      body = JSON.parse(init.body) as unknown;
      return Promise.resolve(
        Response.json({
          success: true,
          result: [
            { success: true, results: [], meta: { changes: 1 } },
            { success: true, results: [], meta: { changes: 1 } },
          ],
        }),
      );
    };
    const database = new D1HttpDatabase("a", "d", "token", fetcher);

    const results = await database.batch([
      database.prepare("INSERT INTO example VALUES (?)").bind("one"),
      database.prepare("INSERT INTO example VALUES (?)").bind("two"),
    ]);

    expect(body).toEqual({
      batch: [
        { sql: "INSERT INTO example VALUES (?)", params: ["one"] },
        { sql: "INSERT INTO example VALUES (?)", params: ["two"] },
      ],
    });
    expect(results).toHaveLength(2);
  });

  it("surfaces Cloudflare API errors without including the credential", async () => {
    const database = new D1HttpDatabase("a", "d", "secret", () =>
      Promise.resolve(
        Response.json(
          { success: false, errors: [{ message: "permission denied" }] },
          { status: 403 },
        ),
      ),
    );

    await expect(database.prepare("SELECT 1").all()).rejects.toThrow(
      "Cloudflare D1 query failed: permission denied",
    );
  });
});
