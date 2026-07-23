import { Form, Link } from "react-router";

import { HistoryNav } from "../components/history-nav";
import { PageHeader } from "../components/page-header";
import { getRequestEnv } from "../lib/server";
import { getTransactionHistory } from "../../server/domain/history";
import type { Route } from "./+types/transactions";

export function meta() {
  return [{ title: "Transaction Wire — Just 2 Guys" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const search = new URL(request.url).searchParams;
  const year = Number(search.get("year"));
  const page = Number(search.get("page"));
  return getTransactionHistory(getRequestEnv(context).DB, {
    year: Number.isInteger(year) ? year : undefined,
    type: search.get("type") ?? undefined,
    page: Number.isInteger(page) ? page : undefined,
  });
}

function typeLabel(value: string) {
  if (value === "free_agent") return "Free agent";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function pageHref(year: number | null, type: string, page: number) {
  const search = new URLSearchParams({
    year: String(year ?? ""),
    type,
    page: String(page),
  });
  return `/history/transactions?${search}`;
}

export default function Transactions({ loaderData }: Route.ComponentProps) {
  return (
    <main className="wrap page">
      <PageHeader eyebrow="Sleeper era" title="Transaction wire" />
      <HistoryNav />
      <div className="history-toolbar transaction-toolbar">
        <p>{loaderData.total.toLocaleString()} completed moves</p>
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
          <label>
            <span>Type</span>
            <select name="type" defaultValue={loaderData.selectedType}>
              <option value="all">All moves</option>
              <option value="trade">Trades</option>
              <option value="waiver">Waivers</option>
              <option value="free_agent">Free agents</option>
              <option value="commissioner">Commissioner</option>
            </select>
          </label>
          <button type="submit">Filter</button>
        </Form>
      </div>
      <div className="transaction-list">
        {loaderData.transactions.map((transaction) => {
          const teamLabels = [
            ...new Map(
              transaction.rosters.map((roster) => [
                roster.team_name,
                `${roster.team_name}${roster.manager_name ? ` · ${roster.manager_name}` : ""}`,
              ]),
            ).values(),
          ];
          return (
            <article key={transaction.id}>
              <header>
                <div>
                  <span>{typeLabel(transaction.type)}</span>
                  <strong>
                    {teamLabels.join(" ↔ ") ||
                      transaction.creator_name ||
                      "League move"}
                  </strong>
                </div>
                <time dateTime={transaction.created_at_provider}>
                  W{transaction.week} ·{" "}
                  {new Date(transaction.created_at_provider).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                    },
                  )}
                </time>
              </header>
              <div className="transaction-items">
                {transaction.items.map((item) => (
                  <Link
                    to={`/players/${item.player_id}`}
                    key={`${item.action}:${item.player_id}`}
                  >
                    <b className={`transaction-${item.action}`}>
                      {item.action === "add" ? "+" : "−"}
                    </b>
                    <span>
                      <strong>{item.player_name}</strong>
                      <small>
                        {item.position}
                        {item.nfl_team ? ` · ${item.nfl_team}` : ""}
                        {item.team_name ? ` · ${item.team_name}` : ""}
                      </small>
                    </span>
                  </Link>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      {loaderData.pageCount > 1 && (
        <nav className="history-pager" aria-label="Transaction pages">
          {loaderData.page > 1 ? (
            <Link
              to={pageHref(
                loaderData.selectedYear,
                loaderData.selectedType,
                loaderData.page - 1,
              )}
            >
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span>
            {loaderData.page} / {loaderData.pageCount}
          </span>
          {loaderData.page < loaderData.pageCount ? (
            <Link
              to={pageHref(
                loaderData.selectedYear,
                loaderData.selectedType,
                loaderData.page + 1,
              )}
            >
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
