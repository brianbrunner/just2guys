import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export function meta() {
  return [
    { title: "Just 2 Guys — Fantasy Football Almanac" },
    {
      name: "description",
      content:
        "The historical record and live scoreboard for the Just 2 Guys fantasy football league.",
    },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#10171f" />
        <Meta />
        <Links />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="site-header">
          <div className="wrap site-header-inner">
            <NavLink className="brand" to="/" aria-label="Just 2 Guys home">
              <span className="brand-mark">J2G</span>
              <span>
                Just 2 Guys<small>Fantasy Football Almanac</small>
              </span>
            </NavLink>
            <nav aria-label="Main navigation">
              <NavLink to="/seasons">Seasons</NavLink>
              <NavLink to="/managers">Managers</NavLink>
              <NavLink to="/records">Records</NavLink>
              <NavLink to="/history">History</NavLink>
              <NavLink to="/about">About</NavLink>
            </nav>
          </div>
        </header>
        <div id="main-content">{children}</div>
        <footer className="site-footer">
          <div className="wrap">
            <strong>Just 2 Guys</strong>
            <span>One league. Too much history.</span>
            <NavLink to="/about">Data methodology</NavLink>
          </div>
        </footer>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const navigation = useNavigation();
  const isNavigating = navigation.state !== "idle";

  return (
    <>
      <div
        className="route-progress"
        data-active={isNavigating || undefined}
        data-testid="route-progress"
        role="progressbar"
        aria-label="Loading page"
        aria-hidden={!isNavigating}
      >
        <span />
      </div>
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something broke the huddle";
  let details = "An unexpected application error occurred.";
  let status = 500;
  if (isRouteErrorResponse(error)) {
    status = error.status;
    title =
      error.status === 404
        ? "That page is off the roster"
        : `${error.status} ${error.statusText}`;
    details = typeof error.data === "string" ? error.data : details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
  }
  return (
    <main className="wrap page error-page">
      <p className="eyebrow">Error {status}</p>
      <h1>{title}</h1>
      <p>{details}</p>
      <NavLink className="button" to="/">
        Back home
      </NavLink>
    </main>
  );
}
