import { NavLink } from "react-router";

const links = [
  ["/history", "Timeline"],
  ["/history/all-play", "All-play"],
  ["/history/drafts", "Drafts"],
  ["/history/transactions", "Transactions"],
  ["/history/team-names", "Team names"],
] as const;

export function HistoryNav() {
  return (
    <nav className="history-nav" aria-label="History sections">
      {links.map(([to, label]) => (
        <NavLink end={to === "/history"} key={to} to={to}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
