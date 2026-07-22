import { PageHeader } from "../components/page-header";

export default function About() {
  return (
    <main className="wrap page prose-page">
      <PageHeader eyebrow="Method, not mythology" title="About the archive" />
      <section>
        <h2>What counts</h2>
        <p>
          Yahoo-era history comes from an immutable SQLite migration source.
          Sleeper-era data comes only from Sleeper’s public, read-only REST API.
          Final provider totals are authoritative, except for five reviewed
          synthetic-playoff corrections where the legacy merger demonstrably
          counted IR points.
        </p>
      </section>
      <section>
        <h2>What does not count</h2>
        <p>
          Byes never become wins. Consolation games do not become playoff
          appearances. Seasons marked “needs review” may be browsed, but they
          stay out of career totals, rivalries, and records until their topology
          and outcomes are approved.
        </p>
      </section>
      <section>
        <h2>Freshness</h2>
        <p>
          During the active season, a Cloudflare Worker checks the current week
          every 30 minutes. The browser polls this site—not Sleeper—every 45
          seconds while the scoreboard is visible. Last-known scores remain
          available if an upstream request fails.
        </p>
      </section>
      <section>
        <h2>Corrections</h2>
        <p>
          Every manual correction is structured, version controlled, idempotent,
          and accompanied by a reason. The site never silently rewrites a
          historical score.
        </p>
      </section>
    </main>
  );
}
