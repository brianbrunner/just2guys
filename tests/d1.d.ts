interface D1QueryResult<T> {
  results: T[];
}

interface D1Result {
  meta: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<D1QueryResult<T>>;
  first<T>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

interface Env {
  DB: D1Database;
  ACTIVE_SEASON: string;
  STALE_AFTER_SECONDS: string;
}
