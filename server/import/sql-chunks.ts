import { createHash } from "node:crypto";

const transactionStatements = new Set([
  "BEGIN;",
  "BEGIN IMMEDIATE;",
  "COMMIT;",
  "PRAGMA foreign_keys = ON;",
]);

export interface SqlChunk {
  sql: string;
  statementCount: number;
  bytes: number;
  sha256: string;
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: "'" | '"' | "`" | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (current === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (current === quote) {
        if (next === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (current === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      quote = current;
      continue;
    }
    if (current !== ";") continue;
    const statement = sql.slice(start, index + 1).trim();
    if (statement) statements.push(statement);
    start = index + 1;
  }

  const trailing = sql.slice(start).trim();
  if (trailing)
    throw new Error("SQL input ends with an unterminated statement");
  if (quote || blockComment)
    throw new Error("SQL input ends inside a quoted value or comment");
  return statements;
}

export function buildSqlChunks(
  sql: string,
  options: { maxBytes?: number; maxStatements?: number } = {},
): SqlChunk[] {
  const maxBytes = options.maxBytes ?? 900_000;
  const maxStatements = options.maxStatements ?? 400;
  const header = "PRAGMA foreign_keys = ON;\n";
  const statements = splitSqlStatements(sql).filter(
    (statement) => !transactionStatements.has(statement.trim()),
  );
  const groups: string[][] = [];
  let current: string[] = [];
  let bytes = Buffer.byteLength(header);

  for (const statement of statements) {
    const statementBytes = Buffer.byteLength(`${statement}\n`);
    if (statementBytes + Buffer.byteLength(header) > maxBytes)
      throw new Error(
        `A single SQL statement is too large for the ${maxBytes}-byte chunk limit`,
      );
    if (
      current.length > 0 &&
      (bytes + statementBytes > maxBytes || current.length >= maxStatements)
    ) {
      groups.push(current);
      current = [];
      bytes = Buffer.byteLength(header);
    }
    current.push(statement);
    bytes += statementBytes;
  }
  if (current.length) groups.push(current);

  return groups.map((group) => {
    const document = `${header}${group.join("\n")}\n`;
    return {
      sql: document,
      statementCount: group.length,
      bytes: Buffer.byteLength(document),
      sha256: createHash("sha256").update(document).digest("hex"),
    };
  });
}
