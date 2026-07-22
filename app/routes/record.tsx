import { Form, Link } from "react-router";

import { PageHeader } from "../components/page-header";
import { RecordTable } from "../components/record-table";
import { getRequestEnv } from "../lib/server";
import { getRecordEntries } from "../../server/domain/record-query";
import {
  recordDefinitions,
  type RecordFilters,
  type RecordPhase,
} from "../../server/domain/records";
import type { Route } from "./+types/record";

const phases = new Set<RecordPhase>([
  "regular",
  "postseason",
  "winners",
  "consolation",
  "losers",
  "placement",
]);

function optionalYear(value: string | null) {
  if (!value) return undefined;
  const year = Number(value);
  return Number.isInteger(year) && year >= 2013 && year <= 2100
    ? year
    : undefined;
}

export async function loader({ params, context, request }: Route.LoaderArgs) {
  const definition = recordDefinitions.find(
    (record) => record.slug === params.slug,
  );
  if (!definition) throw new Response("Record not found", { status: 404 });
  const url = new URL(request.url);
  const requestedPhase = url.searchParams.get("phase") as RecordPhase | null;
  const filters: RecordFilters = {
    fromYear: optionalYear(url.searchParams.get("from")),
    toYear: optionalYear(url.searchParams.get("to")),
    phase:
      definition.supportsPhase && requestedPhase && phases.has(requestedPhase)
        ? requestedPhase
        : undefined,
  };
  if (
    filters.fromYear !== undefined &&
    filters.toYear !== undefined &&
    filters.fromYear > filters.toYear
  ) {
    [filters.fromYear, filters.toYear] = [filters.toYear, filters.fromYear];
  }
  const result = await getRecordEntries(
    getRequestEnv(context).DB,
    definition.slug,
    filters,
  );
  return { definition, filters, ...result };
}

export function headers() {
  return {
    "Cache-Control":
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  };
}

export default function Record({ loaderData }: Route.ComponentProps) {
  return (
    <main className="wrap page">
      <PageHeader
        eyebrow="League record"
        title={loaderData.definition.name}
        description={loaderData.definition.description}
      />
      <aside className="eligibility">
        <strong>Eligibility</strong>
        <span>{loaderData.definition.eligibility}</span>
        <span>
          {loaderData.definition.tieRanking} ranking · top{" "}
          {loaderData.definition.limit}
        </span>
      </aside>
      <Form method="get" className="record-filters">
        <label>
          <span>From season</span>
          <input
            name="from"
            type="number"
            min="2013"
            max="2100"
            defaultValue={loaderData.filters.fromYear}
          />
        </label>
        <label>
          <span>Through season</span>
          <input
            name="to"
            type="number"
            min="2013"
            max="2100"
            defaultValue={loaderData.filters.toYear}
          />
        </label>
        {loaderData.definition.supportsPhase && (
          <label>
            <span>Phase</span>
            <select name="phase" defaultValue={loaderData.filters.phase ?? ""}>
              <option value="">All phases</option>
              <option value="regular">Regular season</option>
              <option value="postseason">All postseason</option>
              <option value="winners">Winners bracket</option>
              <option value="consolation">Consolation</option>
              <option value="losers">Losers bracket</option>
              <option value="placement">Placement</option>
            </select>
          </label>
        )}
        <button className="button" type="submit">
          Apply filters
        </button>
        <Link
          className="text-link"
          to={`/records/${loaderData.definition.slug}`}
        >
          Clear
        </Link>
      </Form>
      <RecordTable entries={loaderData.entries} />
    </main>
  );
}
