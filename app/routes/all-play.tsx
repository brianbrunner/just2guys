import { Form } from "react-router";

import { AllPlayTable } from "../components/all-play-table";
import { HistoryNav } from "../components/history-nav";
import { PageHeader } from "../components/page-header";
import { getRequestEnv } from "../lib/server";
import { getAllPlayHistory } from "../../server/domain/history";
import type { Route } from "./+types/all-play";

export function meta() {
  return [{ title: "All-Play Standings — Just 2 Guys" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const year = Number(new URL(request.url).searchParams.get("year"));
  return getAllPlayHistory(
    getRequestEnv(context).DB,
    Number.isInteger(year) ? year : undefined,
  );
}

export default function AllPlay({ loaderData }: Route.ComponentProps) {
  return (
    <main className="wrap page">
      <PageHeader eyebrow="Alternate table" title="All-play standings" />
      <HistoryNav />
      <div className="history-toolbar">
        <p>
          Each regular-season score plays every other score from the same week.
        </p>
        <Form method="get">
          <label>
            <span>Season</span>
            <select name="year" defaultValue={loaderData.selectedYear ?? ""}>
              {loaderData.seasons.map((season) => (
                <option key={season.year} value={season.year}>
                  {season.year}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Show</button>
        </Form>
      </div>
      <AllPlayTable rows={loaderData.rows} />
      <p className="history-method">
        xW applies each team’s all-play percentage to its actual games. Luck is
        actual wins minus xW; all-play ties count as half a win.
      </p>
    </main>
  );
}
