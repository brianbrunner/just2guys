import { describe, expect, it } from "vitest";

import { safeImageUrl } from "../server/security/image-url";

describe("safeImageUrl", () => {
  it("allows only HTTPS images from the provider CDN allowlist", () => {
    expect(
      safeImageUrl("https://sleepercdn.com/content/nfl/players/thumb/1.jpg"),
    ).toBe("https://sleepercdn.com/content/nfl/players/thumb/1.jpg");
    expect(safeImageUrl("http://sleepercdn.com/avatar.jpg")).toBeNull();
    expect(safeImageUrl("https://example.com/avatar.jpg")).toBeNull();
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
  });
});
