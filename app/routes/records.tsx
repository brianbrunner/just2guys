import { useState } from "react";
import { Link } from "react-router";

import { PageHeader } from "../components/page-header";
import { recordDefinitions } from "../../server/domain/records";

export default function Records() {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const records = recordDefinitions.filter((record) =>
    `${record.name} ${record.description}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  return (
    <main className="wrap page">
      <PageHeader eyebrow="Hall of fame & shame" title="Records" />
      <label className="record-search">
        <span>Find a record</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Try wins, bench, playoffs…"
        />
      </label>
      <div className="record-directory">
        {records.map((record) => {
          const index = recordDefinitions.findIndex(
            (candidate) => candidate.slug === record.slug,
          );
          return (
            <Link to={`/records/${record.slug}`} key={record.slug}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{record.name}</h2>
                <p>{record.description}</p>
              </div>
              <b aria-hidden="true">→</b>
            </Link>
          );
        })}
        {!records.length && (
          <p className="empty-state">No records match “{query}”.</p>
        )}
      </div>
    </main>
  );
}
