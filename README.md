# Just 2 Guys

The public history and live scoreboard for one long-running fantasy-football league. This is a clean-slate TypeScript replacement for the legacy Python/static-site project.

The durable product and data decisions live in [SPEC.md](./SPEC.md). Read it before changing season topology, eligibility rules, or provider interpretation.

## Architecture

- React Router 8 and React 19, rendered by a Cloudflare Worker
- Cloudflare D1 with a Drizzle-owned schema and SQL migrations
- Public, read-only Sleeper REST API integration
- A 30-minute Worker cron during active seasons
- Immutable SQLite input for the complete Yahoo-era archive
- Version-controlled JSON manifests for every season from 2013 onward
- Full all-play standings, league timeline, team-name museum, and Sleeper-era draft/transaction archive
- Custom responsive CSS; no runtime CSS or font CDN

Yahoo network code, browser cookies, Sleeper authentication, and private Sleeper endpoints are intentionally not used.

## Requirements

- Node.js 24 is recommended; `>=22.22.0` is required by React Router 8
- npm
- A Cloudflare account only for remote D1 creation and deployment

## First local setup

```bash
npm ci
npm run db:bootstrap:local
npm run dev
```

`db:bootstrap:local` does four things:

1. Applies the D1 schema migration.
2. Verifies and imports `migration-input/football.db` without modifying it.
3. Fetches the configured Sleeper leagues through the public REST API and writes local reconciliation artifacts under `generated/`.
4. Applies both idempotent imports to local D1 and runs the canonical data validator.

For offline work after the first backfill, regenerate from the frozen local snapshot:

```bash
npm run db:refresh:local
```

The local site runs at `http://127.0.0.1:5173` by default.

## Data workflow

### Yahoo history

The only Yahoo input is `migration-input/football.db`. Its expected SHA-256 is recorded in `migration-input/SHA256SUMS` and enforced by the importer and test suite. The file is opened read-only with SQLite `query_only` enabled.

```bash
npm run import:legacy
```

The import includes only the canonical 2013–2020 leagues and players who appeared in a lineup. It is idempotent and creates:

- `generated/legacy-import/legacy-import.sql`
- `generated/legacy-import/reconciliation.json`
- `generated/legacy-import/reconciliation.md`

Five legacy manually merged playoff totals included IR points because the old calculation excluded only `BN`. Those totals are fixed through explicit reviewed corrections in the season manifests. Bye/unmatched placeholder rows are excluded from score reconciliation. The current reconciliation has zero unexplained score discrepancies.

The league has no legitimate tied games. Sleeper's 2023 Week 14 payload contains real platform scores but an all-zero `custom_points` field, which previously created seven false ties. Manifest version 2 uses platform `points` for only that source week and records the reviewed correction in [`docs/reconciliation/2023.md`](docs/reconciliation/2023.md). Canonical validation fails if any finalized tie remains.

Postseason weeks include only matchups that still determine the championship or last place, plus the final winners-bracket third-place game. In the 14-team seasons, the six-team last-place bracket spans three weeks: two opening games, two second-round games after inverse byes for the two worst seeds, and the last-place final. Sleeper's other post-elimination placement matchups are preserved with phase `placement` for auditability but are excluded from week/season pages and all career, rivalry, player, and record statistics.

Manager profiles also include an Elo history derived from those same canonical games. Everyone starts at 1500, games use a K-factor of 20 and the standard 400-point expectation curve, and score margin is intentionally ignored. Co-managed teams use their managers' average entering rating and give each co-manager the same adjustment.

### Sleeper history

```bash
npm run backfill:sleeper
```

The backfill validates upstream payloads, fetches only configured league IDs, stores compact source snapshots, resolves only referenced players, and generates an idempotent SQL import plus reconciliation reports. It includes public draft boards and transactions for enabled full-league Sleeper sources. The frozen archive currently contains 8 drafts, 1,068 picks, and 2,734 transaction facts; the public transaction wire shows completed moves by default.

Yahoo draft and transaction history is unavailable because the immutable legacy database contains no corresponding source tables. The site labels this history as Sleeper-era coverage rather than inventing or inferring those facts.

The compact public-API snapshot is version controlled so a fresh checkout can rebuild and test the full archive without network access. Generated SQL and reports remain reproducible and are not committed.

To rebuild SQL without hitting Sleeper again:

```bash
npm run import:sleeper:snapshot
```

### Season manifests

`config/seasons/<year>.json` is the authority for:

- canonical week boundaries;
- single- or multi-league structure;
- enabled, ignored, regular-season, postseason, and supplemental sources;
- source week mapping and priority;
- reviewed champion and last-place outcomes;
- corrections and review provenance.

Validate all manifests with:

```bash
npm run manifests:validate
```

### Manager identities

`config/identity-mappings.json` is the reviewed provider identity ledger. It maps provider account IDs to one canonical person; display-name similarity is never used as an automatic merge rule. The 16 owner-confirmed Yahoo/Sleeper mappings combine career totals, rivalries, championships, and player history across platforms. It also records Sleeper-only manager `yuzeh` under the preferred public name Dan.

Validate the seeded canonical database—including team counts, manager mappings, two-sided game invariants, reviewed outcomes, foreign keys, and SQLite integrity—with:

```bash
npm run data:validate
```

Seasons marked `needs_review` remain visible for reconciliation but are excluded from career records. The reviewed 2021 manifest uses the original Evens/Odds conference leagues through Week 16 and repair-league scores for only the two Week 17 ultimate title games, yielding Rob as champion and Breanna as last place. The unrelated 16-team candidate is disabled. See [`docs/reconciliation/2021.md`](docs/reconciliation/2021.md) for the approved evidence and exact source scores.

The reviewed 2022 manifest keeps both conference brackets through Week 16, discards the one-sided Week 17 placeholders, then stitches only the champion and loser comparisons. That confirms Brian K as champion and Julio as last place. The empty 16-team rollover is not canonical. See [`docs/reconciliation/2022.md`](docs/reconciliation/2022.md) for the approved evidence and exact source scores.

## Live synchronization

The Worker cron is configured for every 30 minutes. A scheduled run:

- acquires a 90-second D1 lease so runs cannot overlap;
- reads the current public Sleeper NFL state;
- skips cleanly before the season starts;
- fetches every configured source covering the canonical week, plus brackets;
- refreshes league users/rosters and referenced player metadata on a daily cadence;
- validates every response;
- hashes snapshots and no-ops when nothing changed;
- upserts live matchup and lineup facts in bounded D1 batches;
- records request/write counts, status, timing, and structured errors in `sync_runs`;
- retains the last known good data if Sleeper is temporarily unavailable.

The browser polls the app’s own JSON resource route every 45 seconds only while the page is visible and the season is active. A stale warning appears after 45 minutes without a successful sync, leaving one missed 30-minute run as the operational grace period.

### Test the scheduled handler locally

The Cloudflare Vite development server exposes the Worker scheduled handler on
the same port as the application. With `npm run dev` running against a seeded
local D1 database, trigger one cron invocation with:

```bash
curl "http://127.0.0.1:5173/cdn-cgi/handler/scheduled?cron=*/30+*+*+*+*&format=json"
```

The response reports the Worker invocation outcome. Inspect `/health`, the home
page freshness indicator, or the local `sync_runs` table to verify the
application-level result. In a `pre_draft` season the job deliberately records a
skipped run after reading Sleeper's public NFL state; during the season it syncs
the configured canonical week. This endpoint is supplied only by the local
Cloudflare development runtime and is not a public manual-sync endpoint in
production.

## Verification

```bash
npm run verify
```

This runs generated types, strict TypeScript, ESLint, unit/integration tests, and a production Worker build.

Browser checks require a seeded local database and installed Playwright browser:

```bash
npx playwright install chromium
npm run test:e2e
```

The browser suite covers the key public routes, desktop and mobile behavior, review gates, interactive record filtering and table sorting, week navigation, stale/error states, document overflow, keyboard focus, and serious/critical Axe violations.

## Production deployment

1. Log in to Wrangler and create the database:

   ```bash
   npx wrangler login
   npx wrangler d1 create just2guys
   ```

2. Put the returned database ID in `wrangler.jsonc`, replacing `REPLACE_WITH_PRODUCTION_D1_ID`.
   Record actual legacy-credential revocations in `config/release.json`; never mark those acknowledgements true until the credentials have been revoked at their providers. Likewise, set `productionSyncPathConfirmed` only after a production Worker Cron has reached and validated Sleeper successfully.
3. Apply the schema:

   ```bash
   npm run db:migrate:remote
   ```

4. Generate checksummed, ordered D1 import chunks and rehearse those exact chunks against a clean local SQLite database:

   ```bash
   npm run db:prepare:remote-import
   npm run db:verify:remote-import
   ```

   Preparation rebuilds both idempotent historical imports from immutable/frozen inputs, removes their cross-file transaction wrappers, and writes restart-safe chunks under `generated/remote-import/`. The rehearsal applies every chunk in production order and requires the canonical entity counts, SQLite integrity, and foreign keys to pass.

5. Apply the chunks to remote D1. This refuses to run while the placeholder database ID remains and requires explicit confirmation:

   ```bash
   npm run db:import:remote -- --confirm
   ```

   Every checksum is verified immediately before its chunk is applied. The command stops on the first Wrangler failure, then prints remote counts and `foreign_key_check` after success. All statements are idempotent, so restarting from chunk 1 is safe. To resume after inspecting a known failure, add `--start=N`.

6. Run `npm run verify`.
7. Run the pre-deploy gate. It will stop on unresolved historical reviews, participating identities, credentials, the D1 binding, or active-season configuration:

   ```bash
   npm run release:check:predeploy
   ```

8. Deploy:

   ```bash
   npm run deploy
   ```

9. Configure the custom domain in Cloudflare, record its HTTPS URL in `config/release.json`, and verify the deployed SSR pages, health state, seeded JSON/ETag, and—in season—the existence of a successful cron sync:

   ```bash
   npm run release:check
   npm run release:verify:production
   ```

No application secrets are required. Sleeper is public and read-only.

### Deployment pipeline

`.github/workflows/deploy.yml` is manually triggered and verifies the complete
application and rehearses the historical D1 import before deployment. Configure
these GitHub Actions repository secrets before enabling or running it:

- `CLOUDFLARE_ACCOUNT_ID`: the target Cloudflare account ID.
- `CLOUDFLARE_API_TOKEN`: a scoped token with Workers Scripts and D1 access.

The workflow deliberately does not apply schema migrations or bulk imports.
Those remain explicit operator actions because the database must be exported
before a production schema or bulk-data change. The Worker deployment applies
the Cron Trigger declared in `wrangler.jsonc`.

## Backup and recovery

- Treat the immutable Yahoo SQLite file, season manifests, and Sleeper snapshot as the rebuild inputs.
- Export production D1 before schema or bulk-data changes:

  ```bash
  mkdir -p backups
  npx wrangler d1 export just2guys --remote --output backups/just2guys-before-change.sql
  ```

- All imports are deterministic and idempotent; test them against local D1 before remote execution.
- `backups/` is ignored by Git so a production export cannot be committed accidentally.
- Never edit provider facts ad hoc in production. Add a reviewed correction to the relevant manifest, regenerate, verify, and redeploy.

## Known launch items

- The reviewed 2021 and 2022 conference topology and final outcomes are incorporated into canonical career totals.
- The 16 confirmed Yahoo/Sleeper identities are combined, including owner-confirmed `McTitans = Ashley`. Sleeper-only account `yuzeh` is the distinct manager Dan and has no Yahoo history.
- Production is deployed at `https://just2guys.brian-brunner-720.workers.dev` and `https://just2guys.football`.
- Production Cron reaches and validates Sleeper successfully every 30 minutes. Before the season it records a clean operational skip after reading the public NFL state and performs no matchup writes.
- The release gate still requires owner confirmation that the legacy Yahoo consumer secret and expired Sleeper bearer token were revoked. Neither credential is present in this repository; the immutable SQLite migration copy contains zero rows in its legacy `token` table.
