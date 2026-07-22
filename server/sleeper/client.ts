import { z } from "zod";

import {
  sleeperBracketMatchSchema,
  sleeperLeagueSchema,
  sleeperMatchupSchema,
  sleeperNflStateSchema,
  sleeperPlayersSchema,
  sleeperRosterSchema,
  sleeperUserSchema,
} from "./schemas";

export class SleeperApiError extends Error {
  constructor(
    message: string,
    readonly category: "upstream" | "validation",
    readonly status?: number,
  ) {
    super(message);
    this.name = "SleeperApiError";
  }
}

export class SleeperClient {
  requestCount = 0;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly baseUrl = "https://api.sleeper.app/v1",
  ) {}

  private async request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        this.requestCount += 1;
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
          headers: {
            Accept: "application/json",
            "User-Agent": "just2guys/0.1",
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status >= 500 && attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 250 * 2 ** attempt),
            );
            continue;
          }
          throw new SleeperApiError(
            `Sleeper ${path} returned HTTP ${response.status}`,
            "upstream",
            response.status,
          );
        }
        const parsed = schema.safeParse(await response.json());
        if (!parsed.success) {
          throw new SleeperApiError(
            `Sleeper ${path} failed validation: ${parsed.error.message}`,
            "validation",
          );
        }
        return parsed.data;
      } catch (error) {
        lastError = error;
        if (error instanceof SleeperApiError && error.category === "validation")
          throw error;
        if (attempt < 2)
          await new Promise((resolve) =>
            setTimeout(resolve, 250 * 2 ** attempt),
          );
      } finally {
        clearTimeout(timeout);
      }
    }
    if (lastError instanceof SleeperApiError) throw lastError;
    const detail =
      lastError instanceof DOMException && lastError.name === "AbortError"
        ? "request timed out"
        : lastError instanceof Error
          ? lastError.message
          : "unknown network error";
    throw new SleeperApiError(
      `Sleeper ${path} failed after retries: ${detail}`,
      "upstream",
    );
  }

  league(leagueId: string) {
    return this.request(
      `/league/${encodeURIComponent(leagueId)}`,
      sleeperLeagueSchema,
    );
  }

  users(leagueId: string) {
    return this.request(
      `/league/${encodeURIComponent(leagueId)}/users`,
      z.array(sleeperUserSchema),
    );
  }

  rosters(leagueId: string) {
    return this.request(
      `/league/${encodeURIComponent(leagueId)}/rosters`,
      z.array(sleeperRosterSchema),
    );
  }

  matchups(leagueId: string, week: number) {
    return this.request(
      `/league/${encodeURIComponent(leagueId)}/matchups/${week}`,
      z.array(sleeperMatchupSchema),
    );
  }

  winnersBracket(leagueId: string) {
    return this.request(
      `/league/${encodeURIComponent(leagueId)}/winners_bracket`,
      z
        .array(sleeperBracketMatchSchema)
        .nullable()
        .transform((matches) => matches ?? []),
    );
  }

  losersBracket(leagueId: string) {
    return this.request(
      `/league/${encodeURIComponent(leagueId)}/losers_bracket`,
      z
        .array(sleeperBracketMatchSchema)
        .nullable()
        .transform((matches) => matches ?? []),
    );
  }

  nflState() {
    return this.request("/state/nfl", sleeperNflStateSchema);
  }

  players() {
    return this.request("/players/nfl", sleeperPlayersSchema);
  }
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
