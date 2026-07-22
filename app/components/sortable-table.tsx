import { useMemo, useState, type ReactNode } from "react";

export type SortDirection = "ascending" | "descending";

export interface SortColumn<Row> {
  compare: (left: Row, right: Row) => number;
  initialDirection?: SortDirection;
}

export type SortColumns<Row, Key extends string> = Record<Key, SortColumn<Row>>;

export interface SortState<Key extends string> {
  key: Key;
  direction: SortDirection;
}

export function useSortableRows<Row, Key extends string>(
  rows: Row[],
  columns: SortColumns<Row, Key>,
  initialSort: SortState<Key>,
) {
  const [sort, setSort] = useState(initialSort);
  const sortedRows = useMemo(
    () =>
      rows
        .map((row, originalIndex) => ({ row, originalIndex }))
        .sort((left, right) => {
          const comparison = columns[sort.key].compare(left.row, right.row);
          if (comparison === 0) return left.originalIndex - right.originalIndex;
          return sort.direction === "ascending" ? comparison : -comparison;
        })
        .map(({ row }) => row),
    [columns, rows, sort],
  );

  function requestSort(key: Key) {
    setSort((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === "ascending"
            ? "descending"
            : "ascending"
          : (columns[key].initialDirection ?? "ascending"),
    }));
  }

  return { sortedRows, sort, requestSort };
}

export function SortableHeader<Key extends string>({
  column,
  label,
  sort,
  onSort,
  align = "right",
}: {
  column: Key;
  label: ReactNode;
  sort: SortState<Key>;
  onSort: (column: Key) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === column;
  const direction = active ? sort.direction : "none";
  return (
    <th
      scope="col"
      aria-sort={direction}
      className={`sortable-header sortable-header-${align}`}
    >
      <button type="button" onClick={() => onSort(column)}>
        <span>{label}</span>
        <span className="sort-indicator" aria-hidden="true">
          {active ? (sort.direction === "ascending" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}
