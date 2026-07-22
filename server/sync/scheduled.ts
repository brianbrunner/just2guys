import { getSeasonManifest } from "../manifests/registry";
import type { SeasonManifest } from "../manifests/schema";
import {
  adaptSleeperWeek,
  sourcesForCanonicalWeek,
  sleeperOutcome,
  sleeperPoints,
} from "../sleeper/adapter";
import { SleeperApiError, SleeperClient, contentHash } from "../sleeper/client";
import { sleeperRosterSchema } from "../sleeper/schemas";
import type {
  SleeperLeague,
  SleeperPlayer,
  SleeperRoster,
  SleeperUser,
} from "../sleeper/schemas";
import { safeImageUrl } from "../security/image-url";
import { resolveIdentity } from "../identity/registry";

async function stableId(prefix: string, value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}-${hex.slice(0, 20)}`;
}

function category(error: unknown) {
  if (error instanceof SleeperApiError) return error.category;
  if (error instanceof Error && /map|roster|identity/i.test(error.message))
    return "mapping";
  return "application";
}

async function acquireLease(database: D1Database, owner: string, now: Date) {
  const expiresAt = new Date(now.getTime() + 90_000).toISOString();
  const result = await database
    .prepare(
      `INSERT INTO sync_leases (name, owner, acquired_at, expires_at)
       VALUES ('active-season', ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, acquired_at = excluded.acquired_at, expires_at = excluded.expires_at
       WHERE sync_leases.expires_at < excluded.acquired_at`,
    )
    .bind(owner, now.toISOString(), expiresAt)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

async function releaseLease(database: D1Database, owner: string) {
  await database
    .prepare(
      "DELETE FROM sync_leases WHERE name = 'active-season' AND owner = ?",
    )
    .bind(owner)
    .run();
}

async function executeBatches(
  database: D1Database,
  statements: D1PreparedStatement[],
  size = 50,
) {
  for (let index = 0; index < statements.length; index += size) {
    await database.batch(statements.slice(index, index + size));
  }
}

function playerName(playerId: string, player?: SleeperPlayer) {
  return (
    player?.full_name ||
    [player?.first_name, player?.last_name].filter(Boolean).join(" ") ||
    `${playerId} Defense`
  );
}

function slugify(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "unknown"
  );
}

function sleeperAvatar(avatar: string | null | undefined) {
  return safeImageUrl(
    avatar ? `https://sleepercdn.com/avatars/thumbs/${avatar}` : null,
  );
}

function rosterName(user: SleeperUser | undefined, roster: SleeperRoster) {
  return (
    user?.metadata?.team_name ||
    user?.display_name ||
    `Roster ${roster.roster_id}`
  );
}

function cachedRosters(payloadJson: string | null | undefined) {
  if (!payloadJson) return [];
  try {
    const payload: unknown = JSON.parse(payloadJson);
    if (!payload || typeof payload !== "object") return [];
    const parsed = sleeperRosterSchema
      .array()
      .safeParse((payload as { rosters?: unknown }).rosters);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

async function syncRosterMetadata(input: {
  env: Env;
  client: SleeperClient;
  sourceId: string;
  sourceExternalId: string;
  observedAt: string;
  league: SleeperLeague;
}) {
  const previous = await input.env.DB.prepare(
    `SELECT content_hash, observed_at, payload_json FROM source_snapshots
     WHERE entity_type='league_rosters' AND entity_key=?`,
  )
    .bind(input.sourceExternalId)
    .first<{
      content_hash: string;
      observed_at: string;
      payload_json: string | null;
    }>();
  const priorRosters = cachedRosters(previous?.payload_json);
  if (
    previous &&
    priorRosters.length > 0 &&
    Date.parse(input.observedAt) - Date.parse(previous.observed_at) < 86_400_000
  ) {
    return { changed: false, writes: 0, rosters: priorRosters };
  }

  const [users, rosters] = await Promise.all([
    input.client.users(input.sourceExternalId),
    input.client.rosters(input.sourceExternalId),
  ]);
  const payload = { league: input.league, users, rosters };
  const hash = await contentHash(payload);
  const snapshot = input.env.DB.prepare(
    `INSERT INTO source_snapshots
       (id, season_source_id, entity_type, entity_key, content_hash, observed_at, payload_json)
     VALUES (?, ?, 'league_rosters', ?, ?, ?, ?)
     ON CONFLICT(entity_type, entity_key) DO UPDATE SET
       content_hash=excluded.content_hash, observed_at=excluded.observed_at,
       payload_json=excluded.payload_json`,
  ).bind(
    await stableId(
      "snapshot",
      `sleeper:${input.sourceExternalId}:league-rosters`,
    ),
    input.sourceId,
    input.sourceExternalId,
    hash,
    input.observedAt,
    JSON.stringify(payload),
  );
  if (previous?.content_hash === hash) {
    await snapshot.run();
    return { changed: false, writes: 1, rosters };
  }

  const mapped = await input.env.DB.prepare(
    `SELECT id, external_roster_id, season_team_id FROM source_rosters
     WHERE season_source_id=?`,
  )
    .bind(input.sourceId)
    .all<{
      id: string;
      external_roster_id: string;
      season_team_id: string | null;
    }>();
  const rosterMap = new Map(
    mapped.results.map((row) => [row.external_roster_id, row]),
  );
  const userMap = new Map(users.map((user) => [user.user_id, user]));
  const statements: D1PreparedStatement[] = [];
  for (const roster of rosters) {
    const externalRosterId = `${input.sourceExternalId}:${roster.roster_id}`;
    const mappedRoster = rosterMap.get(externalRosterId);
    if (!mappedRoster?.season_team_id)
      throw new Error(`Unmapped active roster ${externalRosterId}`);
    const owner = roster.owner_id ? userMap.get(roster.owner_id) : undefined;
    const name = rosterName(owner, roster);
    const logo = sleeperAvatar(owner?.avatar);
    statements.push(
      input.env.DB.prepare(
        `UPDATE source_rosters SET name_snapshot=?, logo_url_snapshot=?,
           metadata_json=?, updated_at=? WHERE id=?`,
      ).bind(
        name,
        logo,
        JSON.stringify({
          rosterId: roster.roster_id,
          settings: roster.settings,
          reserve: roster.reserve ?? [],
          taxi: roster.taxi ?? [],
        }),
        input.observedAt,
        mappedRoster.id,
      ),
      input.env.DB.prepare(
        "UPDATE season_teams SET name=?, logo_url=?, updated_at=? WHERE id=?",
      ).bind(name, logo, input.observedAt, mappedRoster.season_team_id),
      input.env.DB.prepare(
        "DELETE FROM source_roster_accounts WHERE source_roster_id=?",
      ).bind(mappedRoster.id),
    );

    const accountIds = [roster.owner_id, ...(roster.co_owners ?? [])].filter(
      (id): id is string => Boolean(id),
    );
    for (const [index, externalAccountId] of accountIds.entries()) {
      const user = userMap.get(externalAccountId);
      const displayName = user?.display_name ?? `Sleeper ${externalAccountId}`;
      const identity = resolveIdentity(
        "sleeper",
        externalAccountId,
        displayName,
      );
      const personId = await stableId("person", identity.canonicalKey);
      const accountId = await stableId(
        "account",
        `sleeper:${externalAccountId}`,
      );
      statements.push(
        input.env.DB.prepare(
          `INSERT INTO people
             (id, slug, preferred_name, aliases_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,
             preferred_name=excluded.preferred_name,
             aliases_json=excluded.aliases_json, updated_at=excluded.updated_at`,
        ).bind(
          personId,
          identity.slug ??
            `${slugify(displayName)}-${externalAccountId.slice(-6)}`,
          identity.preferredName,
          JSON.stringify(identity.aliases),
          input.observedAt,
          input.observedAt,
        ),
        input.env.DB.prepare(
          `INSERT INTO provider_accounts
             (id, provider, external_id, person_id, display_name, avatar_url,
              unresolved_reason, created_at, updated_at)
           VALUES (?, 'sleeper', ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(provider, external_id) DO UPDATE SET
             person_id=excluded.person_id, display_name=excluded.display_name,
             avatar_url=excluded.avatar_url,
             unresolved_reason=excluded.unresolved_reason,
             updated_at=excluded.updated_at`,
        ).bind(
          accountId,
          externalAccountId,
          personId,
          displayName,
          sleeperAvatar(user?.avatar),
          identity.reviewed
            ? null
            : "Cross-provider identity has not been reviewed",
          input.observedAt,
          input.observedAt,
        ),
        input.env.DB.prepare(
          `INSERT INTO season_team_managers (season_team_id, person_id, role)
           VALUES (?, ?, ?)
           ON CONFLICT(season_team_id, person_id) DO UPDATE SET role=excluded.role`,
        ).bind(
          mappedRoster.season_team_id,
          personId,
          index === 0 ? "manager" : "co_manager",
        ),
        input.env.DB.prepare(
          `INSERT INTO source_roster_accounts
             (source_roster_id, provider_account_id, role)
           VALUES (?, ?, ?)
           ON CONFLICT(source_roster_id, provider_account_id) DO UPDATE SET role=excluded.role`,
        ).bind(mappedRoster.id, accountId, index === 0 ? "owner" : "co_owner"),
      );
    }
  }
  statements.push(
    input.env.DB.prepare(
      `DELETE FROM season_team_managers AS stm
       WHERE stm.season_team_id IN (
         SELECT season_team_id FROM source_rosters
         WHERE season_source_id=? AND season_team_id IS NOT NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM source_rosters sr
         JOIN season_sources ss ON ss.id=sr.season_source_id
         JOIN source_roster_accounts sra ON sra.source_roster_id=sr.id
         JOIN provider_accounts pa ON pa.id=sra.provider_account_id
         WHERE ss.provider='sleeper'
           AND sr.season_team_id=stm.season_team_id
           AND pa.person_id=stm.person_id
       )`,
    ).bind(input.sourceId),
  );
  statements.push(snapshot);
  await executeBatches(input.env.DB, statements);
  return { changed: true, writes: statements.length, rosters };
}

export async function syncWeek(input: {
  env: Env;
  client: SleeperClient;
  seasonYear: number;
  source: SeasonManifest["sources"][number];
  sourceId: string;
  observedAt: string;
  sourceWeek: number;
}) {
  const manifest = getSeasonManifest(input.seasonYear);
  if (!manifest) throw new Error(`Missing active manifest ${input.seasonYear}`);
  const [league, matchups, winnersBracket, losersBracket] = await Promise.all([
    input.client.league(input.source.externalId),
    input.client.matchups(input.source.externalId, input.sourceWeek),
    input.client.winnersBracket(input.source.externalId),
    input.client.losersBracket(input.source.externalId),
  ]);
  const payload = {
    league,
    week: input.sourceWeek,
    matchups,
    winnersBracket,
    losersBracket,
  };
  const hash = await contentHash(payload);
  const metadataResult = await syncRosterMetadata({
    env: input.env,
    client: input.client,
    sourceId: input.sourceId,
    sourceExternalId: input.source.externalId,
    observedAt: input.observedAt,
    league,
  });
  const snapshotKey = `${input.source.externalId}:week:${input.sourceWeek}`;
  const previous = await input.env.DB.prepare(
    "SELECT content_hash FROM source_snapshots WHERE entity_type = 'matchup_week' AND entity_key = ?",
  )
    .bind(snapshotKey)
    .first<{ content_hash: string }>();
  const directorySnapshot = await input.env.DB.prepare(
    "SELECT observed_at FROM source_snapshots WHERE entity_type = 'player_directory' AND entity_key = 'nfl'",
  ).first<{ observed_at: string }>();
  const refreshPlayers =
    !directorySnapshot ||
    Date.parse(input.observedAt) - Date.parse(directorySnapshot.observed_at) >
      86_400_000;
  const directory = refreshPlayers ? await input.client.players() : {};
  if (previous?.content_hash === hash && !refreshPlayers) return metadataResult;

  const rosterRows = await input.env.DB.prepare(
    "SELECT id, season_team_id, external_roster_id FROM source_rosters WHERE season_source_id = ?",
  )
    .bind(input.sourceId)
    .all<{ id: string; season_team_id: string; external_roster_id: string }>();
  const rosterMap = new Map(
    rosterRows.results.map((row) => [
      Number(row.external_roster_id.split(":").at(-1)),
      row,
    ]),
  );
  if (rosterMap.size === 0)
    throw new Error(
      `No source roster mappings exist for ${input.source.externalId}`,
    );
  const providerRosters = new Map(
    metadataResult.rosters.map((roster) => [roster.roster_id, roster]),
  );

  const adapted = adaptSleeperWeek({
    leagueId: input.source.externalId,
    week: input.sourceWeek,
    source: input.source,
    manifest,
    league,
    matchups,
    winnersBracket,
    losersBracket,
    observedWeek: input.sourceWeek,
  });
  const statements: D1PreparedStatement[] = [];
  statements.push(
    input.env.DB.prepare("DELETE FROM derived_results WHERE kind='record'"),
  );
  const touchedPlayers: Record<string, SleeperPlayer> = {};
  for (const matchup of adapted) {
    const matchupId = await stableId(
      "matchup",
      `sleeper:${matchup.externalId}`,
    );
    statements.push(
      input.env.DB.prepare(
        `INSERT INTO matchups (id, season_id, season_source_id, external_id, week, phase, round, status, corrected, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(season_source_id, external_id) DO UPDATE SET phase=excluded.phase, round=excluded.round, status=excluded.status, updated_at=excluded.updated_at`,
      ).bind(
        matchupId,
        `season-${input.seasonYear}`,
        input.sourceId,
        matchup.externalId,
        matchup.week,
        matchup.phase,
        matchup.round,
        matchup.status,
        input.observedAt,
        input.observedAt,
      ),
    );
    for (const [sideIndex, side] of matchup.sides.entries()) {
      const roster = rosterMap.get(side.roster_id);
      if (!roster) throw new Error(`Unmapped active roster ${side.roster_id}`);
      const other = matchup.sides.find(
        (candidate) => candidate.roster_id !== side.roster_id,
      );
      const matchupTeamId = await stableId(
        "matchup-team",
        `${matchupId}:${sideIndex + 1}`,
      );
      const outcome =
        matchup.status === "live" || matchup.status === "scheduled"
          ? "pending"
          : sleeperOutcome(side, other, input.source, input.sourceWeek);
      statements.push(
        input.env.DB.prepare(
          `INSERT INTO matchup_teams (id, matchup_id, season_team_id, source_roster_id, side, points, outcome, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(matchup_id, side) DO UPDATE SET points=excluded.points, outcome=excluded.outcome, updated_at=excluded.updated_at`,
        ).bind(
          matchupTeamId,
          matchupId,
          roster.season_team_id,
          roster.id,
          sideIndex + 1,
          sleeperPoints(side, input.source, input.sourceWeek),
          outcome,
          input.observedAt,
          input.observedAt,
        ),
      );
      const starters = new Map(
        side.starters
          .filter((id) => id !== "0")
          .map((id, index) => [id, index]),
      );
      const providerRoster = providerRosters.get(side.roster_id);
      const reserve = new Set(providerRoster?.reserve ?? []);
      const taxi = new Set(providerRoster?.taxi ?? []);
      const starterSlots = league.roster_positions.filter(
        (slot) => !["BN", "IR", "TAXI"].includes(slot),
      );
      const orderedPlayers = [
        ...side.starters,
        ...side.players.filter((id) => !starters.has(id)),
      ].filter(
        (id, index, values) => id !== "0" && values.indexOf(id) === index,
      );
      for (const [slotOrder, playerId] of orderedPlayers.entries()) {
        const player = directory[playerId];
        if (player) touchedPlayers[playerId] = player;
        const position =
          player?.position || (playerId.length <= 3 ? "DEF" : "UNKNOWN");
        const isDefense = position === "DEF" || /^[A-Z]{2,3}$/.test(playerId);
        const playerCanonicalId = await stableId(
          "player",
          `sleeper:${playerId}`,
        );
        statements.push(
          input.env.DB.prepare(
            `INSERT INTO players (id, name, position, nfl_team, image_url, is_defense, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name=CASE WHEN excluded.position='UNKNOWN' THEN players.name ELSE excluded.name END, position=CASE WHEN excluded.position='UNKNOWN' THEN players.position ELSE excluded.position END, nfl_team=COALESCE(excluded.nfl_team, players.nfl_team), active=excluded.active, updated_at=excluded.updated_at`,
          ).bind(
            playerCanonicalId,
            playerName(playerId, player),
            position,
            player?.team ?? (isDefense ? playerId : null),
            isDefense
              ? null
              : `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
            isDefense ? 1 : 0,
            player?.active ? 1 : 0,
            input.observedAt,
            input.observedAt,
          ),
          input.env.DB.prepare(
            `INSERT INTO provider_players (id, provider, external_id, player_id, created_at, updated_at)
             VALUES (?, 'sleeper', ?, ?, ?, ?)
             ON CONFLICT(provider, external_id) DO UPDATE SET player_id=excluded.player_id, updated_at=excluded.updated_at`,
          ).bind(
            await stableId("provider-player", `sleeper:${playerId}`),
            playerId,
            playerCanonicalId,
            input.observedAt,
            input.observedAt,
          ),
          input.env.DB.prepare(
            `INSERT INTO lineup_entries (id, matchup_team_id, player_id, slot, classification, slot_order, points, observed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET slot=excluded.slot, classification=excluded.classification, slot_order=excluded.slot_order, points=excluded.points, observed_at=excluded.observed_at, updated_at=excluded.updated_at`,
          ).bind(
            await stableId(
              "lineup",
              `sleeper:${matchup.externalId}:${side.roster_id}:${playerId}`,
            ),
            matchupTeamId,
            playerCanonicalId,
            starters.has(playerId)
              ? (starterSlots[starters.get(playerId) ?? 0] ?? position)
              : reserve.has(playerId)
                ? "IR"
                : taxi.has(playerId)
                  ? "TAXI"
                  : "BN",
            starters.has(playerId)
              ? "starter"
              : reserve.has(playerId)
                ? "ir"
                : "bench",
            slotOrder,
            side.players_points[playerId] ?? 0,
            input.observedAt,
            input.observedAt,
            input.observedAt,
          ),
        );
      }
    }
  }
  statements.push(
    input.env.DB.prepare(
      `INSERT INTO source_snapshots (id, season_source_id, entity_type, entity_key, content_hash, observed_at, payload_json)
       VALUES (?, ?, 'matchup_week', ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_key) DO UPDATE SET content_hash=excluded.content_hash, observed_at=excluded.observed_at, payload_json=excluded.payload_json`,
    ).bind(
      await stableId("snapshot", `sleeper:${snapshotKey}`),
      input.sourceId,
      snapshotKey,
      hash,
      input.observedAt,
      JSON.stringify(payload),
    ),
  );
  if (refreshPlayers) {
    statements.push(
      input.env.DB.prepare(
        `INSERT INTO source_snapshots (id, entity_type, entity_key, content_hash, observed_at)
         VALUES (?, 'player_directory', 'nfl', ?, ?)
         ON CONFLICT(entity_type, entity_key) DO UPDATE SET content_hash=excluded.content_hash, observed_at=excluded.observed_at`,
      ).bind(
        await stableId("snapshot", "sleeper:player-directory:nfl"),
        await contentHash(touchedPlayers),
        input.observedAt,
      ),
    );
  }
  await executeBatches(input.env.DB, statements);
  return {
    changed: true,
    writes: statements.length + metadataResult.writes,
  };
}

export async function runScheduledSync(env: Env, scheduledTime = Date.now()) {
  const startedAt = new Date(scheduledTime);
  const owner = crypto.randomUUID();
  if (!(await acquireLease(env.DB, owner, startedAt))) {
    console.log(
      JSON.stringify({ event: "sync_skipped", reason: "lease_held" }),
    );
    return;
  }
  const runId = crypto.randomUUID();
  let client: SleeperClient | undefined;
  try {
    await env.DB.prepare(
      `INSERT INTO sync_runs (id, trigger, season_id, status, started_at)
       VALUES (?, 'cron', ?, 'running', ?)`,
    )
      .bind(runId, `season-${env.ACTIVE_SEASON}`, startedAt.toISOString())
      .run();
    const manifest = getSeasonManifest(Number(env.ACTIVE_SEASON));
    if (!manifest)
      throw new Error(`Active season ${env.ACTIVE_SEASON} is not configured`);
    client = new SleeperClient();
    const nfl = await client.nflState();
    if (
      manifest.status === "pre_draft" ||
      nfl.season !== String(manifest.year) ||
      nfl.week < 1
    ) {
      await env.DB.prepare(
        `UPDATE sync_runs SET status='skipped', finished_at=?, upstream_request_count=?, metadata_json=? WHERE id=?`,
      )
        .bind(
          new Date().toISOString(),
          client.requestCount,
          JSON.stringify({ reason: "pre_draft_or_out_of_season", nfl }),
          runId,
        )
        .run();
      return;
    }
    const canonicalWeek = Math.min(nfl.week, manifest.finalWeek);
    const sources = sourcesForCanonicalWeek(manifest, canonicalWeek);
    if (!sources.length)
      throw new Error(
        `No active Sleeper source covers ${manifest.year} week ${canonicalWeek}`,
      );
    const results = [];
    for (const { source, sourceWeek } of sources) {
      results.push(
        await syncWeek({
          env,
          client,
          seasonYear: manifest.year,
          source,
          sourceId: await stableId("source", `sleeper:${source.externalId}`),
          observedAt: new Date().toISOString(),
          sourceWeek,
        }),
      );
    }
    const changed = results.some((result) => result.changed);
    const writes = results.reduce((total, result) => total + result.writes, 0);
    await env.DB.prepare(
      `UPDATE sync_runs SET status=?, finished_at=?, read_count=1, write_count=?, upstream_request_count=?, metadata_json=? WHERE id=?`,
    )
      .bind(
        changed ? "success" : "skipped",
        new Date().toISOString(),
        writes,
        client.requestCount,
        JSON.stringify({
          nflWeek: nfl.week,
          canonicalWeek,
          changed,
          sources: sources.map(({ source, sourceWeek }) => ({
            leagueId: source.externalId,
            sourceWeek,
          })),
        }),
        runId,
      )
      .run();
    console.log(
      JSON.stringify({ event: "sync_complete", runId, changed, writes }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      `UPDATE sync_runs SET status='failed', category=?, finished_at=?, error_summary=?, upstream_request_count=? WHERE id=?`,
    )
      .bind(
        category(error),
        new Date().toISOString(),
        message.slice(0, 1000),
        client?.requestCount ?? 0,
        runId,
      )
      .run();
    console.error(
      JSON.stringify({
        event: "sync_failed",
        runId,
        category: category(error),
        message,
      }),
    );
  } finally {
    await releaseLease(env.DB, owner);
  }
}
