import { Link } from "react-router";

import type { RecordEntry } from "../../server/domain/records";

export function RecordTable({ entries }: { entries: RecordEntry[] }) {
  if (!entries.length)
    return <div className="empty-state">No eligible results yet.</div>;
  return (
    <ol className="record-list">
      {entries.map((entry, index) => (
        <li key={`${entry.label}-${entry.detail}-${index}`}>
          <span className="record-rank">{entry.rank}</span>
          <div className="record-identity">
            {entry.href ? (
              <Link to={entry.href}>{entry.label}</Link>
            ) : (
              <strong>{entry.label}</strong>
            )}
            {entry.secondaryHref ? (
              <Link className="record-detail-link" to={entry.secondaryHref}>
                {entry.detail}
              </Link>
            ) : (
              <span>{entry.detail}</span>
            )}
          </div>
          <strong className="record-value">{entry.valueLabel}</strong>
        </li>
      ))}
    </ol>
  );
}
