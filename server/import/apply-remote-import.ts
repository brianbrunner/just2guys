import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface RemoteImportManifest {
  version: number;
  database: string;
  chunks: Array<{
    order: number;
    file: string;
    bytes: number;
    statementCount: number;
    sha256: string;
  }>;
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const importDir = resolve(projectRoot, "generated/remote-import");
const startArgument = process.argv.find((argument) =>
  argument.startsWith("--start="),
);
const startAt = startArgument ? Number(startArgument.split("=")[1]) : 1;

if (!process.argv.includes("--confirm")) {
  throw new Error(
    "Remote D1 import requires explicit confirmation: npm run db:import:remote -- --confirm",
  );
}
if (!Number.isInteger(startAt) || startAt < 1)
  throw new Error("--start must be a positive chunk number");

const wranglerConfig = await readFile(
  resolve(projectRoot, "wrangler.jsonc"),
  "utf8",
);
if (wranglerConfig.includes("REPLACE_WITH_PRODUCTION_D1_ID"))
  throw new Error(
    "wrangler.jsonc still contains the placeholder production D1 ID",
  );

const manifest = JSON.parse(
  await readFile(resolve(importDir, "manifest.json"), "utf8"),
) as RemoteImportManifest;
if (manifest.version !== 1 || manifest.database !== "just2guys")
  throw new Error("Unsupported or unexpected remote-import manifest");

function runWranglerOnce(arguments_: string[]) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(executable, ["wrangler", ...arguments_], {
      cwd: projectRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Wrangler exited with status ${code}`));
    });
  });
}

async function runWrangler(arguments_: string[], maxAttempts = 4) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runWranglerOnce(arguments_);
      return;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const delayMs = 2 ** (attempt - 1) * 2_000;
      console.warn(
        `Wrangler attempt ${attempt}/${maxAttempts} failed; retrying this idempotent operation in ${delayMs / 1000}s.`,
      );
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, delayMs),
      );
    }
  }
}

for (const chunk of manifest.chunks) {
  if (chunk.order < startAt) continue;
  const path = resolve(importDir, chunk.file);
  const contents = await readFile(path);
  const checksum = createHash("sha256").update(contents).digest("hex");
  if (checksum !== chunk.sha256)
    throw new Error(`Checksum mismatch for ${chunk.file}`);
  console.log(
    `[${chunk.order}/${manifest.chunks.length}] Applying ${chunk.file} (${chunk.statementCount} statements, ${chunk.bytes} bytes)`,
  );
  await runWrangler([
    "d1",
    "execute",
    manifest.database,
    "--remote",
    "--yes",
    "--file",
    path,
  ]);
}

console.log("Remote import complete. Running production count checks.");
await runWrangler([
  "d1",
  "execute",
  manifest.database,
  "--remote",
  "--yes",
  "--command",
  "SELECT (SELECT COUNT(*) FROM seasons) seasons, (SELECT COUNT(*) FROM season_teams) teams, (SELECT COUNT(*) FROM people) people, (SELECT COUNT(*) FROM matchups) matchups, (SELECT COUNT(*) FROM lineup_entries) lineups; PRAGMA foreign_key_check;",
]);
