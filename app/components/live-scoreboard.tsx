import { useEffect, useState } from "react";

import { Scoreboard, type ScoreMatchup } from "./scoreboard";

interface Freshness {
  finished_at: string;
  status: string;
  consecutiveFailures?: number;
  lastFailure?: {
    finished_at: string;
    error_summary: string | null;
  } | null;
}

interface LivePayload {
  matchups: ScoreMatchup[];
  freshness: Freshness | null;
}

function formatTimestamp(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("month")} ${part("day")}, ${part("year")}, ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}

function isLivePayload(value: unknown): value is LivePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    Array.isArray(payload.matchups) &&
    (payload.freshness === null ||
      (typeof payload.freshness === "object" && payload.freshness !== null))
  );
}

export function LiveScoreboard({
  initialMatchups,
  initialFreshness,
  endpoint,
  poll,
  staleAfterSeconds,
}: {
  initialMatchups: ScoreMatchup[];
  initialFreshness: Freshness | null;
  endpoint: string;
  poll: boolean;
  staleAfterSeconds: number;
}) {
  const [matchups, setMatchups] = useState(initialMatchups);
  const [freshness, setFreshness] = useState(initialFreshness);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const stale = Boolean(
    poll &&
    freshness &&
    now !== null &&
    now - Date.parse(freshness.finished_at) > staleAfterSeconds * 1000,
  );

  useEffect(() => {
    setMatchups(initialMatchups);
    setFreshness(initialFreshness);
    setFailed(false);
  }, [endpoint, initialFreshness, initialMatchups]);

  useEffect(() => {
    if (!poll) return;
    let disposed = false;
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(endpoint, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next: unknown = await response.json();
        if (!isLivePayload(next)) throw new Error("Invalid live-score payload");
        if (!disposed) {
          setMatchups(next.matchups);
          setFreshness(next.freshness);
          setFailed(false);
        }
      } catch {
        if (!disposed) setFailed(true);
      }
    }
    setNow(Date.now());
    const timer = window.setInterval(refresh, 45_000);
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [endpoint, poll]);

  return (
    <div>
      <div className="freshness" aria-live="polite">
        {freshness ? (
          <span>
            Updated{" "}
            <time dateTime={freshness.finished_at}>
              {formatTimestamp(freshness.finished_at)} CT
            </time>
          </span>
        ) : (
          <span>No successful sync recorded</span>
        )}
        {stale && <strong className="stale-label">Data may be stale</strong>}
        {failed && (
          <strong className="stale-label">
            Update delayed; showing last known scores
          </strong>
        )}
        {(freshness?.consecutiveFailures ?? 0) >= 3 && (
          <strong className="stale-label">
            Sync is degraded after {freshness?.consecutiveFailures} failed runs;
            showing last known scores
          </strong>
        )}
      </div>
      <Scoreboard matchups={matchups} />
    </div>
  );
}
