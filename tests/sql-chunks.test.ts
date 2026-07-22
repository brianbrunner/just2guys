import { describe, expect, it } from "vitest";

import {
  buildSqlChunks,
  splitSqlStatements,
} from "../server/import/sql-chunks";

describe("remote SQL chunk preparation", () => {
  it("does not split on semicolons or escaped quotes inside values", () => {
    const sql = `INSERT INTO example VALUES ('one; two', 'it''s fine');\nINSERT INTO example VALUES ("quoted; value", 2);\n`;
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO example VALUES ('one; two', 'it''s fine');",
      'INSERT INTO example VALUES ("quoted; value", 2);',
    ]);
  });

  it("removes cross-file transactions and creates bounded restartable chunks", () => {
    const sql = `PRAGMA foreign_keys = ON;\nBEGIN IMMEDIATE;\nINSERT INTO example VALUES (1);\nINSERT INTO example VALUES (2);\nINSERT INTO example VALUES (3);\nCOMMIT;\n`;
    const chunks = buildSqlChunks(sql, {
      maxBytes: 1_000,
      maxStatements: 2,
    });
    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.statementCount)).toEqual([2, 1]);
    for (const chunk of chunks) {
      expect(chunk.bytes).toBeLessThanOrEqual(1_000);
      expect(chunk.sql).toMatch(/^PRAGMA foreign_keys = ON;/);
      expect(chunk.sql).not.toMatch(/BEGIN|COMMIT/);
      expect(chunk.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("rejects unterminated generated SQL", () => {
    expect(() =>
      splitSqlStatements("INSERT INTO example VALUES (1)"),
    ).toThrowError(/unterminated statement/);
  });
});
