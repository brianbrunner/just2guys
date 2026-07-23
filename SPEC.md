# Just 2 Guys — Product and Technical Specification

Status: Implemented and deployed; external launch gates remain
Last updated: 2026-07-22
Intended audience: Future maintainers and coding agents  
Implementation status: Core application deployed and verified; see production status and release gates below

## 1. Purpose of this document

This document is the durable source of truth for a clean-slate replacement of the existing Just 2 Guys fantasy-football history site.

The replacement will eventually live in its own repository. It may initially be developed in this `just2guys-next` directory, but it must not depend on the legacy repository layout at runtime.

This specification is deliberately self-contained so that work can resume after conversation compaction or in a new task without rediscovering the project history.

When implementation details conflict with this document, update this document as part of the same change that alters the decision.

## 2. Product summary

Just 2 Guys is a public fantasy-football league history and live-score site for one long-running league.

The league has operated across Yahoo and Sleeper and has changed format over time. Some seasons used two parallel leagues with manually combined standings or playoffs. At least one season used additional fake Sleeper leagues to repair an incorrect season-length configuration.

The product must:

- Preserve the useful historical facts already captured from Yahoo.
- Backfill and continually update Sleeper seasons.
- Represent unusual season topology explicitly instead of burying it in procedural code.
- Present historical standings, teams, matchups, lineups, managers, rivalries, players, championships, and novelty records.
- Provide score updates within a few minutes during the active season.
- Be enjoyable and polished on desktop and mobile.

## 3. Binding project decisions

These decisions are already made unless this specification is explicitly revised:

1. This is a clean-slate application, schema, and UI.
2. There is no backward-compatibility requirement.
3. Do not preserve legacy URLs and do not build redirects for them.
4. Do not repair or reuse the Yahoo network importer.
5. The existing SQLite database is a read-only migration source for Yahoo-era data.
6. Sleeper integration must use the documented public, read-only REST API.
7. Do not extract browser cookies or depend on private Sleeper GraphQL endpoints.
8. Do not store Sleeper or Yahoo user credentials.
9. Use Cloudflare Workers for hosting and scheduled work.
10. Use Cloudflare D1 for the production database.
11. Use TypeScript and full-stack React Router on the Cloudflare Workers runtime.
12. Use a 30-minute scheduled sync during the active season.
13. No WebSocket or Durable Object is required for the initial release.
14. No site authentication or user accounts are required for the initial release.
15. Historical Yahoo projections should be retained when present. Sleeper projections are optional and must not be obtained from an unsupported private API.

## 4. Explicit non-goals

The initial product will not:

- Support arbitrary fantasy leagues or public self-service league onboarding.
- Write data back to Yahoo or Sleeper.
- Recreate the legacy Python/Peewee/Jinja application.
- Carry forward generated HTML files.
- Preserve legacy database primary keys as public identifiers.
- Preserve every unused player imported from Sleeper.
- Implement drafts, trades, waiver history, chat history, or league financials unless added in a later specification.
- Attempt second-by-second live scoring.
- Introduce a CMS before there is a demonstrated editing need.

## 5. Audited legacy baseline

The legacy migration source is the existing `football.db` SQLite file. Before implementation begins, copy it into a documented migration-input location and record a checksum. All import tests must operate on a copy and must never mutate the source file.

Audited database counts on 2026-07-21:

| Entity | Count |
| --- | ---: |
| League rows | 23 |
| Team rows | 136 |
| Manager rows | 37 |
| Player rows | 10,395 |
| Matchup rows | 1,112 |
| Lineup/roster-slot rows | 26,957 |

Important interpretation:

- The useful Yahoo history covers the canonical 2013–2020 seasons.
- Only 761 players in the database have ever appeared in a lineup.
- 9,634 player rows were bulk-added by unfinished Sleeper work and have never appeared in a lineup. Do not migrate these merely because they exist.
- The database contains only partial and unusable Sleeper data for 2021.
- The partial 2021 data contains 67 matchups but no finalized winners or lineup entries.
- No 2022-or-later season is present in the legacy database.
- SQLite integrity and foreign-key checks passed during the audit.
- The original audit found approximately 140 score comparisons to inspect. Of those, 138 are unmatched/bye placeholders with a platform total of zero and are not valid two-sided score comparisons. Five actual discrepancies came from the legacy manual-playoff calculation counting `IR` points while excluding only `BN`. Per the league owner's direction to fix discrepancies sensibly, the canonical totals exclude those IR points through explicit reviewed manifest corrections. No outcome changed, and the reconciliation now has zero unexplained score discrepancies.

Legacy generated pages, templates, CSS, and Python models are reference material only. They are not implementation inputs except when confirming the feature inventory or record definitions.

## 6. Historical source inventory

### 6.1 Yahoo-era canonical seasons

The legacy database is authoritative for these seasons:

| Season | Yahoo league | Structure |
| --- | --- | --- |
| 2013 | `314.l.818997` | Single league, 14 teams |
| 2014 | `331.l.721731` | Single league, 16 teams |
| 2015 | `348.l.1060011` | Single league, 14 teams |
| 2016 | `359.l.854870` | Single league, 14 teams |
| 2017 | `371.l.683479` | Single league, 16 teams |
| 2018 | `380.l.906329` | Single league, 16 teams |
| 2019 | `390.l.1123131` plus merged `390.l.1117813` data | Two groups of 8 combined into one canonical season |
| 2020 | `399.l.1026513` plus merged `399.l.1079660` data | Two groups of 8 combined into one canonical season |

The old import process destructively moved child-league teams and matchups into the parent league for 2019 and 2020. Team source keys and `group` values retain enough information to preserve Groups A and B in the new canonical model.

### 6.2 Sleeper account and league inventory

Sleeper user ID used to discover candidate leagues:

`467455957719314432`

Discovery is for auditing only. Production must explicitly configure the canonical league sources for each season rather than selecting every league owned by this user or guessing based on league name.

Known sources:

#### 2021 — reviewed conference reconstruction

| Name | Sleeper league ID | Observed role |
| --- | --- | --- |
| Just 2 Guys - Evens | `737467001143988224` | Active 8-team league |
| Just 2 Guys - Odds | `737466838908329984` | Active 8-team league |
| Evens 2: Eventric Boogaloo | `781405019735105536` | Fake/additional 8-team league |
| 2 Odds 2 Furiodds | `781384564496064512` | Fake/additional 8-team league |
| Just 2 Guys | `720897275471155200` | Noncanonical 16-team candidate; disabled |

Owner clarification and provider evidence establish a two-stage conference format: the original Evens/Odds leagues determine their champions and losers through Week 16, and the late-created repair leagues supply Week 17 scores for the cross-conference ultimate title games. The owner approved Rob as champion and Breanna as last place on 2026-07-21. The separate sixteen-team candidate is not canonical. `McTitans` is owner-confirmed as Ashley. Exact scores, source reasoning, and approval are version controlled in `docs/reconciliation/2021.md` and manifest version 2.

#### 2022

| Name | Sleeper league ID | Role |
| --- | --- | --- |
| Just 2 Guys - whiskeys | `864551860646821888` | Active 8-team source |
| Just 2 Guys - tequilas | `864551551908352000` | Active 8-team source |
| Just 2 Guys | `860767078171414528` | Empty rollover; ignore unless later evidence says otherwise |

Owner clarification establishes that Whiskeys and Tequilas played independent conference brackets through Week 16, after which only each conference champion and loser were compared using Week 17 scores. The owner approved Brian K over Manoli for the championship and Julio below Dan for ultimate last place on 2026-07-21. The empty sixteen-team rollover is not canonical. Exact scores and approval are version controlled in `docs/reconciliation/2022.md` and manifest version 2.

#### 2023

| Name | Sleeper league ID | Role |
| --- | --- | --- |
| Just 2 Guys | `995467206685184000` | Active 14-team canonical source |
| Just 2 Guys - whiskeys | `914704279427076096` | Empty rollover; ignore |
| Just 2 Guys - tequilas | `914703464024956928` | Empty rollover; ignore |

#### 2024–2026

| Season | Name | Sleeper league ID | Status at audit |
| --- | --- | --- | --- |
| 2024 | Just 2 Guys | `1129518571475816448` | Complete, 14 teams |
| 2025 | Just 2 Guys | `1257467479928610817` | Complete, 14 teams |
| 2026 | Just 2 Guys | `1312112369765212160` | Pre-draft, 14 teams |

The 2024, 2025, and 2026 leagues are connected through Sleeper's `previous_league_id` chain.

## 7. Architecture

### 7.1 Runtime components

The initial system should be one deployable Cloudflare Worker application with clear internal modules:

- React Router SSR request handler.
- Static assets generated by Vite.
- D1 database binding.
- Scheduled event handler.
- Sleeper public REST client.
- Historical migration CLI that runs locally, not in production requests.

It is acceptable to split the scheduled sync into a second Worker later if operational isolation becomes useful. Do not introduce that split preemptively.

### 7.2 Suggested technology choices

- TypeScript with strict mode.
- React Router full-stack framework mode.
- Cloudflare Vite plugin.
- Drizzle ORM/schema tooling for D1 migrations and typed queries.
- Zod or another explicit runtime validator for upstream API payloads and manifest files.
- Vitest for unit and integration tests.
- Playwright for browser tests.
- Axe integration for accessibility checks.
- A small custom design system using CSS variables and locally built CSS. Avoid runtime CSS frameworks loaded from a CDN.

Package versions should be selected at implementation time and locked. Do not copy legacy Python dependencies into the new project.

### 7.3 Module boundaries

Code should be organized by responsibility, not by page alone:

- `app/routes`: route definitions and route-level data loading.
- `app/components`: reusable presentational components.
- `app/styles`: tokens, reset, typography, and component styles.
- `server/db`: schema, migrations, and query primitives.
- `server/domain`: standings, postseason, rivalries, records, and eligibility rules.
- `server/import`: legacy SQLite migration and reconciliation reports.
- `server/sleeper`: public API client, payload validation, and source adapters.
- `server/sync`: scheduled synchronization, hashing, locking, and finalization.
- `config/seasons`: version-controlled season manifests and reviewed corrections.
- `tests/fixtures`: frozen and scrubbed upstream API fixtures.

Business rules must not live in React components.

## 8. Canonical data model

The canonical data model must distinguish three concepts:

1. Provider facts: what Yahoo or Sleeper reported.
2. League interpretation: how multiple provider leagues and weeks form one Just 2 Guys season.
3. Derived statistics: standings, records, rivalry totals, and awards calculated from canonical facts.

Exact names may change during schema design, but the following entities and responsibilities are required.

### 8.1 `seasons`

One row per canonical Just 2 Guys season.

Required fields include:

- Stable internal ID.
- Year.
- Slug.
- Display name.
- Status: `planned`, `pre_draft`, `in_season`, `complete`, or `needs_review`.
- Regular-season start and end week.
- Playoff start week.
- Final week.
- Number of canonical teams.
- Structure: single league or grouped/multi-league.
- Visibility flag.
- Optional notes.

Week boundaries must come from this row or its manifest, never from global hardcoded comparisons such as `week <= 13`.

### 8.2 `season_sources`

Maps one provider league to a canonical season.

Required fields include:

- Season ID.
- Provider: `yahoo` or `sleeper`.
- External league ID/key.
- Source role: `full`, `regular_season`, `postseason`, or `supplemental`.
- Optional group label such as `A`, `B`, `Whiskeys`, `Tequilas`, `Evens`, or `Odds`.
- Source week range.
- Canonical week mapping or offset.
- Priority when overlapping sources report the same canonical fact.
- Enabled/ignored state and rationale.

### 8.3 `people` and `provider_accounts`

`people` represents a real league participant. `provider_accounts` maps Yahoo GUIDs and Sleeper user IDs to that person.

Requirements:

- Never merge people by display name alone.
- Aliases must be explicit and version controlled or seeded by reviewed migration data.
- Support co-managed teams.
- Preserve historical display names when useful, while exposing a current preferred display name.
- A provider account may exist before it is attached to a canonical person, but unresolved accounts must appear in reconciliation reports.

Owner-reviewed Sleeper aliases, recorded in `config/identity-mappings.json` with provider account IDs, are:

| Sleeper alias | Canonical person |
| --- | --- |
| `liodakis` | Manoli |
| `mcjoules` | Julio |
| `NotTheWorstDad` | Brian B |
| `bcn` | Babacar |
| `rossdarwin` | Ross |
| `jspindell` | Julian |
| `yesimon` | Simon |
| `jwitt90` | Jwitt |
| `bunnyrampage` | Emilio |
| `bkooiman` | Brian K |
| `BreAlvaradoJones` | Breanna |
| `bunnymageEE` | Enrikson |
| `poop_monkey` | Aaron |
| `mikeeatsbutts` | Mike |
| `rconroy293` | Rob |
| `McTitans` | Ashley |

These cover every cross-provider identity, including the owner-confirmed 2021 mapping `McTitans = Ashley`. The owner also confirmed that account `yuzeh`, which first appears in 2022, is a distinct Sleeper-only manager whose preferred public name is Dan. It has no Yahoo-era association.

### 8.4 `season_teams` and `source_rosters`

`season_teams` represents one canonical team entry in one season. `source_rosters` maps provider roster IDs/keys to the canonical team.

Required capabilities:

- Multiple provider rosters may map to one canonical season team, which is necessary for fake playoff leagues.
- Record the team name and logo as historical snapshots rather than mutable global team attributes.
- Record group/division membership.
- Support one or more managers.
- Preserve seed and final placement when known.

### 8.5 `players` and `provider_players`

`players` is the canonical player entity. `provider_players` maps Yahoo and Sleeper IDs.

Requirements:

- Only create/migrate players referenced by a lineup, transaction included in future scope, or a deliberate active player refresh.
- Do not migrate thousands of unused legacy player rows.
- Preserve name, NFL team, position, and image metadata as refreshable attributes.
- Defenses must be modeled consistently and not matched by display name heuristics.

### 8.6 `matchups` and `matchup_teams`

`matchups` stores the canonical contest. `matchup_teams` stores the normally two participating teams and their scores.

Required matchup fields include:

- Season and canonical week.
- Source and external matchup ID.
- Phase: `regular`, `winners`, `consolation`, `losers`, or `placement`.
- Round/sequence within a bracket.
- Status: `scheduled`, `live`, `final`, `corrected`, `cancelled`, or `bye`.
- Bracket order or placement metadata.
- Whether a manual correction affected the matchup.

Required matchup-team fields include:

- Canonical season team.
- Side/order.
- Platform-reported total points.
- Optional projected points.
- Outcome: `win`, `loss`, `tie`, `bye`, or `pending`.
- Optional seed entering the matchup.

Platform totals are authoritative. Reconstructed lineup totals are diagnostics unless a reviewed correction explicitly overrides the platform total.

### 8.7 `lineup_entries`

One player appearance for one matchup team.

Required fields include:

- Player.
- Roster slot label.
- Starter/bench/IR classification.
- Slot order.
- Actual points.
- Optional projected points.
- Source payload timestamp.

Roster slot handling must support modern Sleeper values such as `FLEX` and `SUPER_FLEX`, not only the old Yahoo slot vocabulary.

### 8.8 Raw payload and synchronization metadata

The system must retain enough provenance to explain or safely repeat imports without turning D1 into an unbounded payload archive.

Required concepts:

- `sync_runs`: start/end time, trigger, season, status, error summary, read/write counts, and upstream request count.
- `source_snapshots`: source entity key, content hash, observed timestamp, and optional compact JSON payload.
- A short-lived synchronization lock or lease to prevent overlapping jobs.

Large global Sleeper player payloads should not be stored on every run.

### 8.9 Reviewed corrections

Manual corrections are expected and are first-class data.

Corrections must be:

- Version controlled where practical.
- Structured and validated.
- Applied after provider ingestion but before derived-stat calculation.
- Accompanied by a human-readable reason.
- Idempotent.
- Visible in reconciliation output.

Do not encode one-off seasons as branches scattered across model properties.

## 9. Season manifests

Each season should have a version-controlled manifest under `config/seasons`.

A manifest should declare:

- Canonical year and name.
- Regular-season and playoff week boundaries.
- Canonical team count.
- Source league IDs.
- Source roles and group labels.
- Source-to-canonical week mappings.
- Source roster to canonical team mappings when not inferable.
- Postseason bracket interpretation.
- Ignored candidate leagues and the reason they are ignored.
- Reviewed manual corrections.
- Review status and review date.

Manifest validation must reject:

- Duplicate active source IDs.
- Overlapping source mappings without an explicit priority.
- Unmapped source rosters that participated in a canonical game.
- Canonical games with more than two active participants.
- Missing manager identity mappings.
- A complete season lacking reviewed championship and last-place outcomes.

## 10. Import and synchronization behavior

### 10.1 Legacy SQLite migration

The migration command must:

1. Open the legacy database read-only.
2. Import 2013–2020 provider facts into the new schema.
3. Apply reviewed person and season mappings.
4. Preserve platform matchup totals and historical projections except where an explicit reviewed correction repairs a demonstrated legacy calculation bug.
5. Import only players that appeared in lineups.
6. Produce a machine-readable and human-readable reconciliation report.
7. Be safe to run twice without creating duplicates or changing results.

The migration report must include, by season:

- Source leagues.
- Team and manager counts.
- Matchup counts by phase.
- Lineup-entry counts.
- Champion and last-place result.
- Unresolved identities.
- Score/lineup discrepancies.
- Applied corrections.

### 10.2 Sleeper historical backfill

Backfill 2021–2025 from public REST endpoints and import 2026 metadata.

At minimum, use:

- League metadata.
- League users.
- League rosters.
- Weekly matchups.
- Winners bracket.
- Losers bracket.
- NFL state/current week.
- Player metadata on a controlled refresh cadence.

The public matchup response supplies roster IDs, matchup IDs, starters, all rostered players, player points, and team totals. Bench membership can be derived by subtracting starters from players.

### 10.3 Scheduled active-season sync

The production Worker should receive a Cron Trigger every 30 minutes.

The scheduled handler must:

1. Acquire a short lease; exit if another healthy sync owns it.
2. Read the configured active canonical season.
3. Read the NFL state/current week.
4. Exit cheaply when the league is pre-draft, out of season, or no relevant changes are possible.
5. Fetch current league and matchup data.
6. Validate responses before writing.
7. Hash upstream entity payloads.
8. Upsert only changed entities.
9. Mark games live or final using explicit rules.
10. Refresh brackets and standings when relevant.
11. Invalidate or version affected derived-stat caches.
12. Record a `sync_runs` result.

The handler must be idempotent and recover on the next run after a partial upstream or D1 failure.

Do not blindly rewrite every player row every 30 minutes. Use hashes and separate refresh cadences:

- Live matchup scores: every 30 minutes when relevant.
- League users/rosters: daily and on detected league metadata changes.
- Player directory: daily during the season or on demand.
- Completed historical weeks: no recurring fetch unless a correction is detected or manually requested.

### 10.4 Live browser behavior

The live scoreboard should poll the site's own JSON endpoint every 30–60 seconds while visible and while the current week can change.

Requirements:

- The browser never calls Sleeper directly.
- The UI shows the last successful upstream update time.
- Data older than 45 minutes during live play is visibly marked stale, allowing one missed scheduled interval before warning users.
- Polling pauses or slows when the tab is hidden.
- A failed poll retains the last successful score state.
- Server-rendered content remains usable with JavaScript disabled; live refresh is an enhancement.

## 11. Statistics and domain rules

### 11.1 General rules

- Only final canonical matchups count toward career records unless a record explicitly supports live/provisional entries.
- Byes do not count as wins or losses.
- The league owner confirms there are no legitimate historical ties. A finalized equal-score game is therefore a reconciliation failure and must block canonical validation until its source data is diagnosed.
- Co-managers each receive the team outcome unless a future rule specifies fractional credit.
- Regular-season, winners-bracket, consolation, losers-bracket, and placement games must remain distinguishable.
- Postseason pages and statistics include only games on the active championship path, games on the active last-place path, and the final winners-bracket third-place game. Other post-elimination placement games remain retained provider facts with phase `placement`, but they are not canonical league games and never appear in career totals, rivalries, player history, records, or weekly/season matchup lists.
- For 14-team Sleeper seasons, the active last-place path is a six-team, three-week bracket. The two worst seeds receive inverse opening-round byes, so the canonical path contains two opening games, two second-round games, and the last-place final.
- Regular-season boundaries are season-specific.
- A playoff appearance must come from a qualifying winners-bracket berth, not merely playing a late-season consolation game.
- Platform matchup totals are authoritative.
- Statistics derived from lineup entries must use starter classification rather than a fragile list of excluded slot names.
- Every record definition must state its eligibility, sorting, tie-ranking, and limit behavior.

### 11.2 Existing records that must be preserved

The replacement must include equivalents of all current record pages:

1. Los Campeones — championships by manager and season.
2. Soy Un Perdedor — last-place finishes by manager and season.
3. Nice — games in which a manager's team scored from 69.00 through 69.99 points; count only the team that actually produced the qualifying score.
4. Bad Beats — smallest final margin of victory.
5. Most Wins — total manager wins.
6. Best Manager Record — manager win percentage with a clearly displayed minimum-games rule if one is adopted.
7. Favorite Players — most starts by manager/player pairing.
8. Real Dedication — lowest starter points per game for manager/player pairings meeting the minimum-game threshold.
9. Postseason Appearances — qualifying winners-bracket appearances.
10. Demolished — largest margin of victory.
11. Put Me In, Coach — highest-scoring non-QB bench performances.
12. Take The Low Road — lowest combined matchup scores.
13. Take The High Road — highest combined matchup scores.
14. Domination — strongest manager head-to-head records with a minimum matchup count.
15. Best Regular Season — most regular-season wins by season team.

Each record should support a stable slug and may support filters for season range, regular/postseason phase, and provider era.

### 11.3 Standings

Default regular-season standings order:

1. Wins.
2. Ties only if a future manifest explicitly changes the current zero-ties invariant.
3. Points for.
4. Points against only if the historical season explicitly used it as a tiebreaker.
5. Stable display fallback.

Because historical leagues may have used different official tiebreakers, the season manifest may override this ordering. The UI should label reconstructed standings when official seed data is unavailable.

### 11.4 Rivalries

Rivalry calculations must include:

- Wins, losses, and ties.
- Total games.
- Win percentage.
- Points for and against.
- Largest and smallest victory.
- Largest and smallest defeat.
- Current streak.
- Postseason meetings.
- Chronological matchup list.

Projection-based upset counts should be shown only for games where both teams have valid projection data.

### 11.5 Manager Elo

- Manager quality is summarized with a transparent Elo rating replayed from the beginning of the canonical archive in year/week order.
- Every manager begins at 1500. The expected result uses the standard 400-point Elo scale and each game uses K-factor 20.
- Only reviewed, final canonical matchups are eligible. Byes, live games, under-review seasons, and noncompetitive `placement` games do not update ratings.
- Score margin does not affect Elo; a win is a win. This avoids allowing platform-era scoring inflation or one extreme lineup to dominate the rating.
- Co-managed teams use the co-managers' average entering rating as the team rating and apply the same team-level adjustment to each co-manager.
- Ratings persist across seasons without offseason regression. The manager page shows the current rating, league rank, peak, low, and post-game rating history.

## 12. Product information architecture

No legacy route compatibility is required. Prefer readable canonical routes.

Suggested routes:

- `/` — home/current-season dashboard.
- `/seasons` — season archive.
- `/seasons/:year` — season overview.
- `/seasons/:year/weeks/:week` — weekly scoreboard.
- `/matchups/:id` — matchup and lineup detail.
- `/managers` — manager directory and career leaderboard.
- `/managers/:slug` — manager profile.
- `/rivalries/:managerA/:managerB` — head-to-head profile.
- `/players/:id` — player history.
- `/records` — record explorer.
- `/records/:slug` — individual record leaderboard.
- `/about` — league/site explanation and data methodology.

IDs and slugs should be stable within the new application. They do not need to match legacy IDs.

## 13. Page requirements

### 13.1 Home

The home page should prioritize the current season while giving immediate access to history.

Include:

- Live or latest weekly scoreboard.
- Last-updated and stale-state indicator.
- Current standings.
- Current week navigation.
- Recent notable performances or record changes.
- Current champion/last completed season summary during the offseason.
- Season archive entry point.
- Career leaderboard preview.

### 13.2 Season page

Include:

- Season name, year, format, and status.
- Group/division labeling when applicable.
- Final or current standings.
- Week selector and matchup summaries.
- Winners, consolation, and losers brackets when applicable.
- Champion and last-place result.
- Season-specific awards and record performances.
- Clear note when a season is still under data review.

### 13.3 Matchup page

Include:

- Teams, managers, score, outcome, phase, and week.
- Live/final status.
- Side-by-side lineups on wide screens.
- Readable stacked comparison on narrow screens.
- Starter, bench, and IR grouping.
- Player points and projections when available.
- Link back to the season week and relevant team/manager profiles.

### 13.4 Manager page

Include:

- Preferred name and known provider-era aliases when useful.
- Career wins, losses, ties, win percentage, points, championships, last-place finishes, and playoff appearances.
- Season-by-season team history.
- Best finish and best regular season.
- Closest rival and nemesis.
- Favorite players and notable records.

### 13.5 Rivalry page

Include:

- Symmetric head-to-head summary.
- Chronological matchup history.
- Current streak.
- Closest game and largest blowout.
- Postseason meetings.
- Scoring comparison.

### 13.6 Records

Include:

- Searchable record directory.
- Clear descriptions and eligibility rules.
- Ranked, tie-aware leaderboards.
- Season and phase filters where meaningful.
- Links from every entity in a record row to its detail page.
- A visible provisional label if a live season can affect the result.

### 13.7 Player page

Include only players with league participation.

Include:

- Name, position, NFL team, and image when available.
- Career Just 2 Guys starts, bench appearances, and points.
- Manager/team history.
- Best and worst relevant performances.
- Record appearances.

## 14. Visual and interaction direction

The site should feel like a bespoke sports almanac, not a generic admin dashboard or a clone of Sleeper.

Design principles:

- Bold editorial typography with excellent numeric readability.
- A compact but breathable layout suitable for dense statistics.
- Team colors and logos as accents, not as the sole status indicator.
- Clear visual separation between regular season, winners bracket, consolation, and losers bracket.
- Mobile-first layout.
- Tables that become useful cards or controlled horizontal views on small screens.
- Every data-table column is sortable in both directions with keyboard-operable headers and an exposed current sort direction.
- Brackets that use round tabs or deliberate horizontal navigation on mobile.
- Meaningful loading, empty, live, final, stale, and error states.
- No dependence on third-party runtime CSS or font CDNs.
- Respect reduced-motion preferences.
- Meet WCAG 2.2 AA for color contrast, keyboard use, landmarks, and focus visibility.

A focused visual prototype for the home, season, and matchup pages should be reviewed before the full UI is implemented.

## 15. Performance and caching

Targets for the initial public release:

- Server-render meaningful content on first response.
- Keep most pages functional without client JavaScript.
- Cache completed historical pages aggressively at the edge.
- Cache current-season SSR responses briefly, initially 30–60 seconds.
- Expose ETags or version identifiers for live JSON responses.
- Avoid N+1 database access by designing page-specific aggregate queries.
- Do not recompute every historical record on every request.
- Recompute or invalidate derived results only when relevant finalized data changes.

The current dataset is small. Favor understandable indexed SQL and measured caching over premature distributed systems.

## 16. Security and privacy

- Remove and revoke the Yahoo consumer secret found in the legacy source.
- Remove the expired Sleeper bearer token found in the legacy source.
- Do not copy either secret into the new directory or repository.
- The Sleeper REST API requires no token.
- Do not expose private email addresses, phone numbers, cookies, or account credentials.
- Treat all upstream names, team names, avatars, and image URLs as untrusted data.
- Escape rendered text and validate outbound image URLs.
- Protect any future manual-sync or correction endpoint with Cloudflare Access or a server-side secret.
- Public read endpoints should be rate-limited only if actual abuse appears; do not add user authentication solely for rate limiting.

## 17. Observability and operations

The deployed system must provide:

- Structured Worker logs.
- Sync-run history in D1.
- Clear error categorization: upstream, validation, mapping, database, or application.
- A health/status view or endpoint showing the most recent successful sync and active season.
- Alerts or a visible operational signal after repeated sync failures.
- Documented D1 export/backup procedure before schema migrations.
- Local development using Cloudflare's local D1 and scheduled-handler emulation.

The public UI should display stale data gracefully even when upstream Sleeper or a scheduled job is failing.

## 18. Testing strategy

### 18.1 Import tests

- Legacy source is opened read-only.
- Import is idempotent.
- Golden entity counts are recorded for every Yahoo season.
- Champions and last-place results are verified for 2013–2020.
- Multi-league Groups A and B are preserved for 2019 and 2020.
- Score discrepancies are classified as placeholders, explained corrections, or unresolved; explained corrections are applied only through reviewed manifests.
- Unused legacy players are not migrated.
- Person-account mappings have no unresolved accounts for published seasons.

### 18.2 Sleeper adapter tests

- Validate fixtures for league, user, roster, matchup, bracket, NFL state, and player responses.
- Unknown fields are tolerated where safe; missing required fields fail clearly.
- Empty rollover leagues remain ignored.
- Repeated syncs do not create duplicates.
- Hash-equal payloads do not produce unnecessary writes.
- Partial upstream failure preserves the last good state.
- Final-score corrections update affected derived statistics.

### 18.3 Domain tests

- Season-specific regular-season boundaries.
- Wins, losses, ties, and byes.
- Standings tiebreakers.
- Playoff qualification versus consolation participation.
- Championship and last-place derivation.
- Co-manager attribution.
- All 15 preserved record definitions.
- Correct `Nice` scoring attribution.
- Rivalry chronological ordering.
- Bench and starter classification across Yahoo and Sleeper slot vocabularies.

### 18.4 Application tests

- Every required route returns expected content from a seeded D1 fixture.
- Live scoreboard updates without full-page navigation.
- Stale and error states are visible and accessible.
- Keyboard navigation and focus behavior.
- Automated accessibility checks.
- Focused responsive checks at representative phone and desktop widths.
- Focused interaction coverage for the home, season, bracket, matchup, manager, rivalry, player, and records routes.

### 18.5 Implementation checkpoint (2026-07-21)

Completed locally:

- React Router 8/React 19 Cloudflare Worker application with custom responsive design.
- Eighteen-table Drizzle/D1 schema and initial SQL migration.
- Validated season manifests for 2013–2026.
- Immutable, checksum-enforced Yahoo import for 2013–2020 with zero unexplained score discrepancies.
- Public-REST Sleeper client, 14-source audit/backfill, compact snapshots, and idempotent import.
- Scheduled 30-minute sync with D1 lease, payload hashing, bounded writes, run logging, and stale-data behavior.
- Season archive/detail, weekly scoreboard, matchup/lineup, manager, rivalry, player, record, about, JSON, and health routes.
- All 15 named record definitions, standings, brackets, review gates, source provenance, and correction visibility.
- A reproducible manager Elo model (1500 baseline, K=20) and responsive SVG history chart on every manager profile, using only canonical games.
- Reviewed cross-provider identity registry combining the 16 owner-confirmed Yahoo/Sleeper manager pairs without display-name inference. Career totals, championships, rivalries, player history, and co-managed teams now share canonical people across provider eras.
- Reviewed 2021 and 2022 multi-conference seasons with four explicit stitched Week 17 title games, complete roster mappings, and approved outcomes included in career totals.
- Reviewed 2023 Week 14 correction selecting populated platform scores over the source's anomalous all-zero `custom_points` values; canonical and remote-import validation require zero finalized ties.
- Sleeper postseason brackets are reduced to owner-approved meaningful paths: championship progression, the five-game inverse-bye last-place path, and the final third-place game. Six noncompetitive placement games per single-league 2023–2025 season remain auditable but are excluded from every page and statistic.
- Local D1 seeded with 14 seasons, 210 canonical teams, 23 canonical people, 1,072 players, 1,668 matchups, and 45,853 lineup entries; canonical validation and foreign-key checks pass.
- Strict typecheck, lint, 69 unit/integration tests, production build, and 20 Playwright browser tests pass. Browser coverage stays focused on desktop/mobile behavior, Axe accessibility checks, keyboard navigation, sortable tables, week-to-week score replacement, required routes/JSON resources, live polling/failure retention/hidden-tab behavior, zero-ties enforcement, review gates, search, and overflow.
- The two large historical SQL imports are split into 244 ordered, checksummed, restart-safe D1 chunks containing 97,035 statements. CI rehearses every chunk against a clean database and requires canonical counts, integrity, foreign keys, and zero finalized ties before production import is permitted.
- A production release checker blocks deployment while historical reviews, participating identities, D1 configuration, credential-revocation acknowledgements, or a confirmed production sync path remain incomplete. Post-deployment verification requires HTTPS SSR content, healthy status, seeded JSON/ETag behavior, and an in-season successful operational sync.

Production status:

- Production D1, Worker, 30-minute Cron Trigger, Workers.dev preview, and the `just2guys.football` custom domain are configured. The imported production dataset passes counts, foreign keys, zero-ties, and HTTPS smoke checks on both production hosts.
- Production Cron reaches and validates Sleeper successfully. A pre-draft production run completed after one public NFL-state request with no data writes, proving the deployed network and runtime path before in-season synchronization begins.
- Revoking the credentials found in the legacy repository remains an owner action; neither credential is copied, required, or stored by this application.

## 19. Delivery phases

Implementation is organized into the following reviewable phases. The league owner authorized a continuous initial implementation pass; each boundary remains useful for future maintenance and review.

### Phase 0 — specification and source preservation

- Review and amend this specification.
- Copy the legacy SQLite source into a clearly named migration-input location.
- Record checksum and audit metadata.
- Record credential-revocation actions without copying secrets.

Exit condition: the specification and immutable migration input are accepted.

### Phase 1 — application and database foundation

- Scaffold the Cloudflare React Router application.
- Configure strict TypeScript, formatting, linting, tests, and CI.
- Define D1 schema and initial migrations.
- Add seed and local test database tooling.
- Add validated season-manifest types.

Exit condition: an empty application deploys and schema/test tooling works locally and in CI.

### Phase 2 — Yahoo historical migration

- Build the read-only SQLite importer.
- Add reviewed Yahoo manager identity mappings.
- Import 2013–2020.
- Generate reconciliation reports.
- Add golden migration and domain tests.

Exit condition: historical counts and reviewed outcomes match the legacy source without calling Yahoo.

### Phase 3 — Sleeper backfill and season reconciliation

- Build the public REST client.
- Backfill candidate 2021 sources and generate a review report.
- Obtain human approval for the 2021 manifest.
- Backfill 2022–2025.
- Import 2026 metadata and rosters when available.
- Resolve Sleeper/Yahoo person identities.

Exit condition: every published season has reviewed sources, complete matchup coverage, and no unresolved active manager identity.

### Phase 4 — domain queries and record parity

- Implement standings, postseason, manager career, rivalry, player, and record queries.
- Add all 15 required record definitions.
- Add derived-stat invalidation/versioning.

Exit condition: all current product capabilities have a tested domain implementation independent of UI.

### Phase 5 — UI and visual system

- Produce focused design prototypes.
- Implement the design system and required pages.
- Add focused responsive, accessibility, and interaction coverage.

Exit condition: all pages work on phone and desktop, meet accessibility gates, and display seeded historical data correctly.

### Phase 6 — live synchronization and production launch

- Implement the 30-minute scheduled handler.
- Add live JSON polling and stale states.
- Configure production D1, custom domain, HTTPS, logging, and backups.
- Run a full production-data reconciliation.

Exit condition: live scores update within the target window, failure states recover automatically, and the custom domain passes HTTPS checks.

## 20. Release acceptance criteria

The initial release is complete only when all of the following are true:

- 2013–2020 historical Yahoo data is migrated without a Yahoo API call.
- 2021 source topology has explicit human approval.
- 2022–2025 Sleeper seasons are complete.
- 2026 is configured as the active season.
- The site includes seasons, standings, brackets, weekly matchups, lineup details, managers, rivalries, players, and all 15 record categories.
- The zero-ties invariant, byes, postseason phases, and co-managers behave according to this specification.
- The scheduled sync is idempotent and runs every 30 minutes during relevant periods.
- Live data visibly reports freshness and stale state.
- No Yahoo or Sleeper credential is required or stored.
- Production uses D1 migrations and has a documented backup/export procedure.
- Required browser, accessibility, import, adapter, and domain tests pass.
- The custom domain serves valid HTTPS.
- No legacy URL or redirect work was added.

## 21. Known open questions

These are legitimate decisions still requiring evidence or product input. They must not be silently guessed during implementation:

1. What minimum-game threshold should apply to Best Manager Record, if any?
2. Should historical official playoff seeds override reconstructed standings everywhere, or only in bracket displays?
3. How should stat corrections that arrive after a season is complete be surfaced to users?
4. Should live-season records appear provisionally during games, after a matchup becomes final, or only after the week is complete?
5. Which team logos may be safely hot-linked, and should the production site proxy/cache them?
6. What final visual identity, wordmark, colors, and tone should be approved after the first design prototype?

## 22. Working rules for future agents

- Read this entire document before implementation work.
- Inspect the current worktree before editing and preserve unrelated user changes.
- Update this document when a binding decision changes.
- Keep implementation scoped to the current delivery phase.
- Prefer explicit manifests, migrations, and tests over undocumented one-off scripts.
- Never run the legacy Yahoo importer.
- Never mutate the only copy of the legacy SQLite database.
- Never use an authenticated browser session, cookie extraction, or private Sleeper GraphQL API for production data.
- Do not add backward compatibility or redirects unless the user explicitly reverses the current decision.
- Do not add infrastructure merely because Cloudflare offers it; justify new services against an observed need.
- At the end of each phase, record reconciliation results and remaining open questions before advancing.
