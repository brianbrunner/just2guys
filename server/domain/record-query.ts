import { loadDomainDataset } from "./dataset";
import {
  calculateRecord,
  filterRecordDataset,
  type RecordEntry,
  type RecordFilters,
} from "./records";

const RECORD_CACHE_VERSION = 1;
const acquisitionRecordSlugs = new Set(["draft-class", "off-the-wire"]);

function hasFilters(filters: RecordFilters) {
  return Boolean(filters.fromYear || filters.toYear || filters.phase);
}

function isRecordEntries(value: unknown): value is RecordEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        typeof (entry as RecordEntry).rank === "number" &&
        typeof (entry as RecordEntry).label === "string" &&
        typeof (entry as RecordEntry).value === "number",
    )
  );
}

export async function getRecordEntries(
  database: D1Database,
  slug: string,
  filters: RecordFilters = {},
) {
  const cacheKey = `record:${slug}`;
  if (!hasFilters(filters)) {
    const cached = await database
      .prepare(
        "SELECT payload_json FROM derived_results WHERE key=? AND kind='record' AND version=?",
      )
      .bind(cacheKey, RECORD_CACHE_VERSION)
      .first<{ payload_json: string }>();
    if (cached) {
      try {
        const entries: unknown = JSON.parse(cached.payload_json);
        if (isRecordEntries(entries)) return { entries, cached: true };
      } catch {
        // A malformed cache row is safely replaced from canonical facts below.
      }
    }
  }

  const dataset = await loadDomainDataset(database, {
    includeAcquisitions: acquisitionRecordSlugs.has(slug),
  });
  const entries =
    slug === "giant-killer"
      ? calculateRecord(dataset, slug).filter(
          (entry) =>
            (filters.fromYear === undefined ||
              (entry.year ?? 0) >= filters.fromYear) &&
            (filters.toYear === undefined ||
              (entry.year ?? 0) <= filters.toYear) &&
            (!filters.phase ||
              (filters.phase === "postseason"
                ? entry.phase !== "regular"
                : entry.phase === filters.phase)),
        )
      : calculateRecord(filterRecordDataset(dataset, filters), slug);
  if (!hasFilters(filters)) {
    try {
      await database
        .prepare(
          `INSERT INTO derived_results (key, kind, version, payload_json, computed_at)
           VALUES (?, 'record', ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET version=excluded.version,
             payload_json=excluded.payload_json, computed_at=excluded.computed_at`,
        )
        .bind(
          cacheKey,
          RECORD_CACHE_VERSION,
          JSON.stringify(entries),
          new Date().toISOString(),
        )
        .run();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "record_cache_write_failed",
          slug,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  return { entries, cached: false };
}
