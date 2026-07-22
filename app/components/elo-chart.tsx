import type { ManagerEloPoint } from "../../server/domain/elo";
import { ELO_INITIAL_RATING } from "../../server/domain/elo";

interface EloChartProps {
  managerName: string;
  managerSlug: string;
  points: ManagerEloPoint[];
}

export function EloChart({ managerName, managerSlug, points }: EloChartProps) {
  if (points.length === 0) return null;
  const width = 900;
  const height = 280;
  const padding = { top: 24, right: 24, bottom: 38, left: 52 };
  const ratings = points.map((point) => point.rating);
  const dataMin = Math.min(ELO_INITIAL_RATING, ...ratings);
  const dataMax = Math.max(ELO_INITIAL_RATING, ...ratings);
  const spread = Math.max(80, dataMax - dataMin);
  const min = Math.floor((dataMin - spread * 0.12) / 20) * 20;
  const max = Math.ceil((dataMax + spread * 0.12) / 20) * 20;
  const x = (index: number) =>
    padding.left +
    (index / Math.max(1, points.length - 1)) *
      (width - padding.left - padding.right);
  const y = (rating: number) =>
    padding.top +
    ((max - rating) / (max - min)) * (height - padding.top - padding.bottom);
  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(point.rating).toFixed(2)}`,
    )
    .join(" ");
  const baseline = height - padding.bottom;
  const area = `${line} L ${x(points.length - 1).toFixed(2)} ${baseline} L ${x(0).toFixed(2)} ${baseline} Z`;
  const gridRatings = [min, (min + max) / 2, max];
  const years = [...new Set(points.map((point) => point.year))];
  const yearTicks = years.filter(
    (_, index) => index % 2 === 0 || index === years.length - 1,
  );
  const gradientId = `elo-fill-${managerSlug}`;
  const current = points.at(-1)?.rating ?? ELO_INITIAL_RATING;

  return (
    <figure className="elo-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`elo-title-${managerSlug} elo-description-${managerSlug}`}
      >
        <title id={`elo-title-${managerSlug}`}>
          {managerName}&apos;s Elo history
        </title>
        <desc id={`elo-description-${managerSlug}`}>
          Rating after each of {points.length} canonical games, beginning from a
          1500 baseline and ending at {Math.round(current)}.
        </desc>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--orange)" stopOpacity="0.3" />
            <stop offset="1" stopColor="var(--orange)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridRatings.map((rating) => (
          <g key={rating} className="elo-gridline">
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(rating)}
              y2={y(rating)}
            />
            <text x={padding.left - 10} y={y(rating) + 4} textAnchor="end">
              {Math.round(rating)}
            </text>
          </g>
        ))}
        {min <= ELO_INITIAL_RATING && max >= ELO_INITIAL_RATING && (
          <line
            className="elo-baseline"
            x1={padding.left}
            x2={width - padding.right}
            y1={y(ELO_INITIAL_RATING)}
            y2={y(ELO_INITIAL_RATING)}
          />
        )}
        {yearTicks.map((year) => {
          const index = points.findIndex((point) => point.year === year);
          return (
            <text
              className="elo-year"
              key={year}
              x={x(index)}
              y={height - 12}
              textAnchor={index === 0 ? "start" : "middle"}
            >
              {year}
            </text>
          );
        })}
        <path className="elo-area" d={area} fill={`url(#${gradientId})`} />
        <path className="elo-line" d={line} />
        {points.map((point, index) => (
          <circle
            className="elo-hit-target"
            key={`${point.matchupId}:${index}`}
            cx={x(index)}
            cy={y(point.rating)}
            r="6"
          >
            <title>
              {point.year} Week {point.week} vs {point.opponents}:{" "}
              {point.outcome}
              {" · "}
              {Math.round(point.rating)} ({point.delta >= 0 ? "+" : ""}
              {point.delta.toFixed(1)})
            </title>
          </circle>
        ))}
        <circle
          className="elo-current-point"
          cx={x(points.length - 1)}
          cy={y(current)}
          r="5"
        />
      </svg>
    </figure>
  );
}
