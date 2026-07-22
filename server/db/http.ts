type QueryValue = string | number | null;

interface QueryInput {
  sql: string;
  params?: QueryValue[];
}

interface QueryMeta {
  changes?: number;
  duration?: number;
  last_row_id?: number;
  rows_read?: number;
  rows_written?: number;
  [key: string]: unknown;
}

interface QueryResult {
  success: boolean;
  results?: unknown[];
  meta?: QueryMeta;
}

interface ApiResponse {
  success: boolean;
  result?: QueryResult[];
  errors?: Array<{ code?: number; message?: string }>;
}

export class D1HttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "D1HttpError";
  }
}

function normalizeValue(value: unknown): QueryValue {
  if (value === null || typeof value === "string" || typeof value === "number")
    return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new TypeError(
    "The D1 HTTP adapter supports scalar query parameters only.",
  );
}

class HttpPreparedStatement {
  constructor(
    private readonly database: D1HttpDatabase,
    readonly sql: string,
    readonly params: QueryValue[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new HttpPreparedStatement(
      this.database,
      this.sql,
      values.map(normalizeValue),
    );
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const result = await this.database.execute([this.input()]);
    const row = result[0]?.results?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T = Record<string, unknown>>() {
    const result = await this.database.execute([this.input()]);
    return this.database.asD1Result<T>(result[0]);
  }

  async run<T = Record<string, unknown>>() {
    const result = await this.database.execute([this.input()]);
    return this.database.asD1Result<T>(result[0]);
  }

  input(): QueryInput {
    return { sql: this.sql, params: this.params };
  }
}

export class D1HttpDatabase {
  private readonly endpoint: string;

  constructor(
    accountId: string,
    databaseId: string,
    private readonly apiToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  }

  prepare(sql: string) {
    return new HttpPreparedStatement(this, sql);
  }

  async batch(statements: D1PreparedStatement[]) {
    const inputs = statements.map((statement) => {
      if (!(statement instanceof HttpPreparedStatement))
        throw new TypeError("Cannot mix D1 bindings in one HTTP batch.");
      return statement.input();
    });
    return (await this.execute(inputs)).map((result) =>
      this.asD1Result(result),
    );
  }

  async execute(inputs: QueryInput[]) {
    const body = inputs.length === 1 ? inputs[0] : { batch: inputs };
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as ApiResponse;
    if (!response.ok || !payload.success || !payload.result) {
      const message =
        payload.errors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join("; ") || `HTTP ${response.status}`;
      throw new D1HttpError(`Cloudflare D1 query failed: ${message}`);
    }
    if (payload.result.some((result) => !result.success))
      throw new D1HttpError(
        "Cloudflare D1 returned an unsuccessful query result.",
      );
    return payload.result;
  }

  asD1Result<T>(result: QueryResult | undefined) {
    if (!result) throw new Error("Cloudflare D1 returned no query result.");
    return {
      success: result.success,
      results: (result.results ?? []) as T[],
      meta: result.meta ?? {},
    };
  }
}

export function createD1HttpDatabase(input: {
  accountId: string;
  databaseId: string;
  apiToken: string;
  fetcher?: typeof fetch;
}) {
  return new D1HttpDatabase(
    input.accountId,
    input.databaseId,
    input.apiToken,
    input.fetcher,
  ) as unknown as D1Database;
}
