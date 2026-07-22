import { z } from "zod";

const nullableString = z.string().nullable().optional();
const numericValue = z.union([z.number(), z.string().transform(Number)]);

export const sleeperLeagueSchema = z.object({
  league_id: z.string(),
  name: z.string(),
  season: z.string(),
  status: z.string(),
  previous_league_id: nullableString,
  roster_positions: z.array(z.string()).default([]),
  settings: z
    .object({
      num_teams: z.number().int().nonnegative(),
      playoff_week_start: z.number().int().nonnegative().optional(),
      leg: z.number().int().nonnegative().optional(),
      last_scored_leg: z.number().int().nonnegative().optional(),
      playoff_teams: z.number().int().positive().optional(),
    })
    .loose(),
  scoring_settings: z.record(z.string(), numericValue).default({}),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const sleeperUserSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  avatar: nullableString,
  metadata: z
    .object({
      team_name: nullableString,
    })
    .loose()
    .nullable()
    .optional(),
});

export const sleeperRosterSchema = z.object({
  roster_id: z.number().int().positive(),
  owner_id: nullableString,
  co_owners: z.array(z.string()).nullable().optional(),
  players: z.array(z.string()).nullable().optional(),
  starters: z.array(z.string()).nullable().optional(),
  reserve: z.array(z.string()).nullable().optional(),
  taxi: z.array(z.string()).nullable().optional(),
  settings: z.record(z.string(), numericValue.nullable()).default({}),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const sleeperMatchupSchema = z.object({
  roster_id: z.number().int().positive(),
  matchup_id: z.number().int().positive().nullable(),
  points: z.number().nullable().default(0),
  custom_points: z.number().nullable().optional(),
  starters: z
    .array(z.string())
    .nullable()
    .transform((players) => players ?? []),
  players: z
    .array(z.string())
    .nullable()
    .transform((players) => players ?? []),
  starters_points: z.array(z.number()).nullable().optional(),
  players_points: z
    .record(z.string(), z.number())
    .nullable()
    .transform((points) => points ?? {}),
});

export const sleeperBracketMatchSchema = z
  .object({
    r: z.number().int().positive(),
    m: z.number().int().positive(),
    t1: z.number().int().positive().nullable().optional(),
    t2: z.number().int().positive().nullable().optional(),
    w: z.number().int().positive().nullable().optional(),
    l: z.number().int().positive().nullable().optional(),
    p: z.number().int().positive().nullable().optional(),
    t1_from: z.record(z.string(), z.unknown()).optional(),
    t2_from: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export const sleeperNflStateSchema = z.object({
  season: z.string(),
  season_type: z.string(),
  week: z.number().int().nonnegative(),
  display_week: z.number().int().nonnegative().optional(),
  league_season: z.string().optional(),
  previous_season: z.string().optional(),
});

export const sleeperPlayerSchema = z
  .object({
    player_id: z.string(),
    full_name: nullableString,
    first_name: nullableString,
    last_name: nullableString,
    position: nullableString,
    fantasy_positions: z.array(z.string()).nullable().optional(),
    team: nullableString,
    status: nullableString,
    active: z.boolean().optional(),
    sport: z.string().optional(),
  })
  .loose();

export const sleeperPlayersSchema = z.record(z.string(), sleeperPlayerSchema);

export type SleeperLeague = z.infer<typeof sleeperLeagueSchema>;
export type SleeperUser = z.infer<typeof sleeperUserSchema>;
export type SleeperRoster = z.infer<typeof sleeperRosterSchema>;
export type SleeperMatchup = z.infer<typeof sleeperMatchupSchema>;
export type SleeperBracketMatch = z.infer<typeof sleeperBracketMatchSchema>;
export type SleeperNflState = z.infer<typeof sleeperNflStateSchema>;
export type SleeperPlayer = z.infer<typeof sleeperPlayerSchema>;
