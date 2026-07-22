import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

const sourcePath = new URL("../migration-input/football.db", import.meta.url);
const expectedSha256 =
  "6c44d98b65be5a5e22505132b22727abbfe46a45516518b7486ae9941e70ffce";

describe("immutable Yahoo migration source", () => {
  it("matches the audited checksum", () => {
    const digest = createHash("sha256")
      .update(readFileSync(sourcePath))
      .digest("hex");
    expect(digest).toBe(expectedSha256);
  });

  it("passes integrity checks and retains the audited source counts", () => {
    const database = new DatabaseSync(sourcePath, { readOnly: true });
    expect(database.prepare("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(database.prepare("SELECT COUNT(*) count FROM league").get()).toEqual(
      { count: 23 },
    );
    expect(
      database.prepare("SELECT COUNT(*) count FROM matchup").get(),
    ).toEqual({ count: 1112 });
    expect(
      database.prepare("SELECT COUNT(*) count FROM matchuprosterslot").get(),
    ).toEqual({ count: 26957 });
    expect(database.prepare("SELECT COUNT(*) count FROM token").get()).toEqual({
      count: 0,
    });
    database.close();
  });
});
