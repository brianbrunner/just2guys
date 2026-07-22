import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home opens on the current scoreboard without serious accessibility issues", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "2025 · Week 17" }),
  ).toBeVisible();
  await expect(page.locator(".freshness")).toContainText(
    "No successful sync recorded",
  );
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});

test("reviewed conference seasons show their stitched title games", async ({
  page,
}) => {
  await page.goto("/seasons/2021");
  await expect(page.getByText("Under data review.")).toHaveCount(0);
  await expect(page.locator(".result-banner").getByText("Rob")).toBeVisible();
  await expect(
    page.locator(".result-banner").getByText("Breanna"),
  ).toBeVisible();
  await expect(
    page.locator(".score-grid").getByText("Ultimate championship"),
  ).toBeVisible();
  await expect(
    page.locator(".score-grid").getByText("Ultimate last place"),
  ).toBeVisible();
  await expect(page.getByText("781405019735105536")).toBeVisible();
});

test("the canonical archive has no ties and restores 2023 Week 14", async ({
  page,
}) => {
  await page.goto("/seasons/2023/weeks/14");
  await expect(page.locator(".score-card")).toHaveCount(7);
  await expect(page.getByText("133.72", { exact: true })).toBeVisible();
  await expect(page.getByText("108.94", { exact: true })).toBeVisible();
  const weekText = await page.locator("main").innerText();
  expect(weekText).not.toContain("0.00");

  await page.goto("/records/most-wins");
  const recordText = await page.locator("main").innerText();
  expect(recordText).not.toMatch(/\d+–\d+–[1-9]\d*/);
});

test("week pager replaces the scoreboard with the newly loaded week", async ({
  page,
}) => {
  await page.goto("/seasons/2025/weeks/14");
  await expect(page.locator(".score-card")).toHaveCount(7);

  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/seasons\/2025\/weeks\/15$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Week 15");
  await expect(page.locator(".score-card")).toHaveCount(6);

  await page.getByRole("link", { name: "Previous" }).click();
  await expect(page).toHaveURL(/\/seasons\/2025\/weeks\/14$/);
  await expect(page.locator(".score-card")).toHaveCount(7);
});

test("record directory filters by description", async ({ page }) => {
  await page.goto("/records");
  await page.waitForLoadState("networkidle");
  const searchbox = page.getByRole("searchbox", { name: "Find a record" });
  await searchbox.fill("bench");
  await expect(searchbox).toHaveValue("bench");
  await expect(
    page.getByRole("heading", { name: "Put Me In, Coach" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Los Campeones" }),
  ).toHaveCount(0);
});

test("data tables sort in both directions from accessible headers", async ({
  page,
}) => {
  await page.goto("/managers");
  const managerHeader = page.getByRole("columnheader", { name: "Manager" });
  await managerHeader.getByRole("button").click();
  await expect(managerHeader).toHaveAttribute("aria-sort", "ascending");
  const ascendingNames = await page
    .locator(".manager-table tbody th a")
    .allTextContents();
  expect(ascendingNames).toEqual(
    [...ascendingNames].sort((left, right) => left.localeCompare(right)),
  );

  await managerHeader.getByRole("button").click();
  await expect(managerHeader).toHaveAttribute("aria-sort", "descending");
  const descendingNames = await page
    .locator(".manager-table tbody th a")
    .allTextContents();
  expect(descendingNames).toEqual([...ascendingNames].reverse());

  await page.goto("/seasons/2025");
  const winsHeader = page
    .locator(".standings-table")
    .getByRole("columnheader", { name: "W", exact: true });
  await winsHeader.getByRole("button").click();
  await expect(winsHeader).toHaveAttribute("aria-sort", "descending");
  const wins = await page
    .locator(".standings-table tbody tr td:nth-child(3)")
    .allTextContents();
  expect(wins.map(Number)).toEqual(
    [...wins].map(Number).sort((left, right) => right - left),
  );
});

test("mobile pages avoid document-level horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/seasons/2025");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("every public route and JSON status resource returns seeded content", async ({
  page,
  request,
}) => {
  const pages = [
    ["/", "On the board"],
    ["/seasons", "Season archive"],
    ["/seasons/2025", "2025 · Just 2 Guys 2025"],
    ["/seasons/2025/weeks/17", "Week 17"],
    ["/matchups/matchup-b2413e134c390230a879", "vs"],
    ["/managers", "Managers"],
    ["/managers/brian-b", "Brian B"],
    ["/managers/dan", "1 season recorded"],
    ["/managers/ashley", "sleeper: McTitans"],
    ["/rivalries/brian-b/rob", "Brian B vs Rob"],
    ["/players/player-7e8f1854adc28571f9cb", "Just 2 Guys appearances"],
    ["/records", "Records"],
    ["/records/most-wins", "Most Wins"],
    ["/about", "About the archive"],
  ] as const;
  for (const [path, text] of pages) {
    await page.goto(path);
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
  }
  await page.goto("/rivalries/brian-b/rob");
  await expect(page.getByText("Rob leads 7–4 (63.6%)")).toBeVisible();
  const health = await request.get("/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ ok: true });
  const week = await request.get("/api/seasons/2025/weeks/17");
  expect(week.status()).toBe(200);
  expect(week.headers().etag).toBeTruthy();
  expect(await week.json()).toMatchObject({ matchups: expect.any(Array) });
});

test("keyboard users can reveal the skip link and reach main content", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
});

test("live scoreboard refreshes, pauses while hidden, and retains scores after failure", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/test-live-scoreboard.json", async (route) => {
    requestCount += 1;
    if (requestCount > 1) {
      await route.fulfill({ status: 503, body: "upstream delayed" });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        freshness: {
          finished_at: new Date().toISOString(),
          status: "success",
        },
        matchups: [
          {
            id: "live-matchup",
            year: 2026,
            week: 1,
            phase: "regular",
            status: "live",
            sides: [
              {
                id: "live-side",
                teamName: "New score arrived",
                teamSlug: "new-score",
                points: 123.45,
                outcome: "pending",
                managers: [{ slug: "brian-b", name: "Brian B" }],
              },
            ],
          },
        ],
      }),
    });
  });
  await page.goto("/");
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Vite modules are loaded dynamically inside the browser test harness. */
  await page.evaluate(async () => {
    const importModule = (path: string) => import(/* @vite-ignore */ path);
    const reactModule = await importModule("/@id/react");
    const React = reactModule.default ?? reactModule;
    const clientModule = await importModule("/@id/react-dom/client");
    const createRoot =
      clientModule.createRoot ?? clientModule.default?.createRoot;
    const routerModule = await importModule("/@id/react-router");
    const MemoryRouter =
      routerModule.MemoryRouter ?? routerModule.default?.MemoryRouter;
    const { LiveScoreboard } = await importModule(
      "/app/components/live-scoreboard.tsx",
    );
    const mount = document.createElement("div");
    mount.id = "live-scoreboard-test";
    document.body.append(mount);
    createRoot(mount).render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(LiveScoreboard, {
          initialMatchups: [],
          initialFreshness: {
            finished_at: new Date(Date.now() - 600_000).toISOString(),
            status: "success",
          },
          endpoint: "/test-live-scoreboard.json",
          poll: true,
          staleAfterSeconds: 300,
        }),
      ),
    );
  });
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
  const fixture = page.locator("#live-scoreboard-test");

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  expect(requestCount).toBe(0);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(fixture.getByText("New score arrived")).toBeVisible();
  await expect(fixture.getByText("123.45")).toBeVisible();

  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    fixture.getByText("Update delayed; showing last known scores"),
  ).toBeVisible();
  await expect(fixture.getByText("New score arrived")).toBeVisible();
  await expect(fixture.getByText("123.45")).toBeVisible();
});
