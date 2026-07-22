import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSqlChunks } from "./sql-chunks";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = resolve(projectRoot, "generated/remote-import");
const inputs = [
  {
    name: "legacy",
    path: resolve(projectRoot, "generated/legacy-import/legacy-import.sql"),
  },
  {
    name: "sleeper",
    path: resolve(projectRoot, "generated/sleeper-backfill/sleeper-import.sql"),
  },
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const manifestChunks: Array<{
  order: number;
  source: string;
  file: string;
  bytes: number;
  statementCount: number;
  sha256: string;
}> = [];
let order = 0;
for (const input of inputs) {
  const sql = await readFile(input.path, "utf8");
  const chunks = buildSqlChunks(sql);
  for (const [sourceIndex, chunk] of chunks.entries()) {
    order += 1;
    const file = `${String(order).padStart(3, "0")}-${input.name}-${String(sourceIndex + 1).padStart(3, "0")}.sql`;
    await writeFile(resolve(outputDir, file), chunk.sql, "utf8");
    manifestChunks.push({
      order,
      source: basename(input.path),
      file,
      bytes: chunk.bytes,
      statementCount: chunk.statementCount,
      sha256: chunk.sha256,
    });
  }
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  database: "just2guys",
  sourceOrder: inputs.map((input) => input.name),
  totalStatements: manifestChunks.reduce(
    (total, chunk) => total + chunk.statementCount,
    0,
  ),
  totalBytes: manifestChunks.reduce((total, chunk) => total + chunk.bytes, 0),
  contentHash: createHash("sha256")
    .update(manifestChunks.map((chunk) => chunk.sha256).join("\n"))
    .digest("hex"),
  chunks: manifestChunks,
};
await writeFile(
  resolve(outputDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(
  `Prepared ${manifest.chunks.length} ordered remote-import chunks (${manifest.totalStatements} statements, ${manifest.totalBytes} bytes) in ${outputDir}.`,
);
