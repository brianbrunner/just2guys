export function StatusPill({ status }: { status: string }) {
  const label = status.replaceAll("_", " ");
  return <span className={`status-pill status-${status}`}>{label}</span>;
}
