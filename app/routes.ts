import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("seasons", "routes/seasons.tsx"),
  route("seasons/:year", "routes/season.tsx"),
  route("seasons/:year/weeks/:week", "routes/week.tsx"),
  route("matchups/:id", "routes/matchup.tsx"),
  route("managers", "routes/managers.tsx"),
  route("managers/:slug", "routes/manager.tsx"),
  route("rivalries/:managerA/:managerB", "routes/rivalry.tsx"),
  route("records", "routes/records.tsx"),
  route("records/:slug", "routes/record.tsx"),
  route("players/:id", "routes/player.tsx"),
  route("about", "routes/about.tsx"),
  route("api/seasons/:year/weeks/:week", "routes/api-week.ts"),
  route("health", "routes/health.ts"),
] satisfies RouteConfig;
