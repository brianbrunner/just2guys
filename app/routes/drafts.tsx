import { Form } from "react-router";

import { DraftTable } from "../components/draft-table";
import { HistoryNav } from "../components/history-nav";
import { PageHeader } from "../components/page-header";
import { getRequestEnv } from "../lib/server";
import { getDraftHistory } from "../../server/domain/history";
import type { Route } from "./+types/drafts";

export function meta() {
  return [{ title: "Draft Archive — Just 2 Guys" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const year = Number(new URL(request.url).searchParams.get("year"));
  return getDraftHistory(
    getRequestEnv(context).DB,
    Number.isInteger(year) ? year : undefined,
  );
}

export default function Drafts({ loaderData }: Route.ComponentProps) {
  return (
    <main className="wrap page">
      <PageHeader eyebrow="Sleeper era" title="Draft archive" />
      <HistoryNav />
      <div className="history-toolbar">
        <p>Complete Sleeper draft boards are available from 2021 onward.</p>
        <Form method="get">
          <label>
            <span>Season</span>
            <select name="year" defaultValue={loaderData.selectedYear ?? ""}>
              {loaderData.seasons.map((season) => (
                <option key={season.year} value={season.year}>
                  {season.year} · {season.picks} picks
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Show</button>
        </Form>
      </div>
      <div className="draft-archive">
        {loaderData.drafts.map((draft) => (
          <section key={draft.id}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {draft.type} · {draft.rounds} rounds
                </p>
                <h2>
                  {draft.group_label ?? `${loaderData.selectedYear} draft`}
                </h2>
              </div>
              <strong>{draft.picks.length} picks</strong>
            </div>
            <DraftTable picks={draft.picks} />
          </section>
        ))}
      </div>
    </main>
  );
}
