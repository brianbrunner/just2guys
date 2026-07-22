import { describe, expect, it } from "vitest";

import { evaluateReleaseGates } from "../server/release/gates";

describe("production release gates", () => {
  it("reports each unresolved external requirement", () => {
    const gates = evaluateReleaseGates({
      d1Configured: false,
      reviewYears: [2021, 2022],
      unresolvedAccounts: ["722600873687064576"],
      legacyYahooCredentialRevoked: false,
      legacySleeperCredentialRevoked: false,
      productionUrl: null,
      requireProductionUrl: true,
      activeSeasonConfigured: true,
    });
    expect(gates.filter((gate) => gate.status === "blocked")).toHaveLength(6);
    expect(gates.find((gate) => gate.id === "active-season")?.status).toBe(
      "pass",
    );
  });

  it("passes only when every launch condition is satisfied", () => {
    expect(
      evaluateReleaseGates({
        d1Configured: true,
        reviewYears: [],
        unresolvedAccounts: [],
        legacyYahooCredentialRevoked: true,
        legacySleeperCredentialRevoked: true,
        productionUrl: "https://just2guys.example.com",
        requireProductionUrl: true,
        activeSeasonConfigured: true,
      }).every((gate) => gate.status === "pass"),
    ).toBe(true);
  });

  it("defers the production URL gate during a pre-deploy check", () => {
    const gate = evaluateReleaseGates({
      d1Configured: true,
      reviewYears: [],
      unresolvedAccounts: [],
      legacyYahooCredentialRevoked: true,
      legacySleeperCredentialRevoked: true,
      productionUrl: null,
      requireProductionUrl: false,
      activeSeasonConfigured: true,
    }).find((candidate) => candidate.id === "production-url");
    expect(gate?.status).toBe("pass");
  });
});
