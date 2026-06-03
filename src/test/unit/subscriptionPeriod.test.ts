import { describe, it, expect } from "vitest";
import {
  SUBSCRIPTION_PERIOD_SECONDS,
  countForSubscriptionPeriod,
  resolveSubscriptionCount,
  subscriptionPeriodToSeconds,
} from "../../subscriptionPeriod";

describe("subscriptionPeriod", () => {
  it("maps day, week, month, year to fixed seconds", () => {
    expect(subscriptionPeriodToSeconds("day")).toBe(86_400n);
    expect(subscriptionPeriodToSeconds("week")).toBe(604_800n);
    expect(subscriptionPeriodToSeconds("month")).toBe(2_592_000n);
    expect(subscriptionPeriodToSeconds("year")).toBe(31_536_000n);
  });

  it("computes period count to cover template length (ceil division)", () => {
    expect(countForSubscriptionPeriod("day", 86_400n)).toBe(1n);
    expect(countForSubscriptionPeriod("week", 86_400n)).toBe(7n);
    expect(countForSubscriptionPeriod("month", 86_400n)).toBe(30n);
    expect(countForSubscriptionPeriod("year", 2_592_000n)).toBe(13n);
  });

  it("resolveSubscriptionCount uses count when provided", () => {
    expect(resolveSubscriptionCount({ count: 3n }, 86_400n)).toBe(3n);
  });

  it("resolveSubscriptionCount derives count from period", () => {
    expect(resolveSubscriptionCount({ period: "week" }, 86_400n)).toBe(7n);
  });

  it("rejects count and period together", () => {
    expect(() =>
      resolveSubscriptionCount({ count: 1n, period: "day" }, 86_400n),
    ).toThrow(/either count or period/i);
  });

  it("rejects missing count and period", () => {
    expect(() => resolveSubscriptionCount({}, 86_400n)).toThrow(/count or period is required/i);
  });

  it("documents month as 30 days", () => {
    expect(SUBSCRIPTION_PERIOD_SECONDS.month).toBe(30n * SUBSCRIPTION_PERIOD_SECONDS.day);
  });

  it("rejects zero or negative asset period seconds", () => {
    expect(() => countForSubscriptionPeriod("day", 0n)).toThrow(/must be positive/i);
    expect(() => countForSubscriptionPeriod("week", -1n)).toThrow(/must be positive/i);
  });

  it("rejects count below 1", () => {
    expect(() => resolveSubscriptionCount({ count: 0n }, 86_400n)).toThrow(/at least 1/i);
  });
});
