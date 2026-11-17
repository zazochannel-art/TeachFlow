import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter, isCrossSite } from "@/lib/rate-limit";
import { WEBHOOK_BUDGET, takeWebhookBudget } from "@/lib/monitoring";

describe("createRateLimiter", () => {
  it("allows up to the limit per window, per key", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([1, 2, 3, 4].map(() => rl.take("a", 0))).toEqual([true, true, true, false]);
    expect(rl.take("b", 0)).toBe(true);
    expect(rl.take("a", 999)).toBe(false);
    expect(rl.take("a", 1000)).toBe(true);
  });

  it("stays bounded when many addresses show up", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 10 });
    for (let i = 0; i < 100; i++) expect(rl.take(`ip${i}`, 0)).toBe(true);
  });
});

describe("request helpers", () => {
  it("takes the first forwarded address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("spots cross-site browser requests", () => {
    expect(isCrossSite(new Headers({ "sec-fetch-site": "cross-site" }), "app.md")).toBe(true);
    expect(isCrossSite(new Headers({ "sec-fetch-site": "same-origin", origin: "https://app.md" }), "app.md")).toBe(false);
    expect(isCrossSite(new Headers({ origin: "https://evil.example" }), "app.md")).toBe(true);
    expect(isCrossSite(new Headers(), "app.md")).toBe(false);
  });
});

describe("webhook budget", () => {
  it("caps webhook posts per window", () => {
    const t = 10_000_000_000;
    let sent = 0;
    for (let i = 0; i < WEBHOOK_BUDGET + 10; i++) if (takeWebhookBudget(t)) sent++;
    expect(sent).toBe(WEBHOOK_BUDGET);
    expect(takeWebhookBudget(t + 10 * 60 * 1000)).toBe(true);
  });
});
