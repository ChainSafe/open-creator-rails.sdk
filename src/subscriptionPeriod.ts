/**
 * Wall-clock subscription period templates (fixed second lengths, not calendar months).
 *
 * - `month` = 30 days, `year` = 365 days (common billing approximations).
 * - On-chain assets bill in multiples of the asset's configured period (`getSubscriptionDuration()`).
 * - `period: "month"` resolves to enough period-count to cover ~30 days of access.
 */
export const SUBSCRIPTION_PERIOD_SECONDS = {
  day: 86_400n,
  week: 604_800n,
  month: 2_592_000n,
  year: 31_536_000n,
} as const;

export type SubscriptionPeriod = keyof typeof SUBSCRIPTION_PERIOD_SECONDS;

/** Pass exactly one of `count` or `period`. */
export type SubscriptionPeriodCountInput =
  | { count: bigint; period?: undefined }
  | { count?: undefined; period: SubscriptionPeriod };

export function subscriptionPeriodToSeconds(period: SubscriptionPeriod): bigint {
  return SUBSCRIPTION_PERIOD_SECONDS[period];
}

/** Period-count on chain to cover at least `period` template length. */
export function countForSubscriptionPeriod(period: SubscriptionPeriod, assetPeriodSeconds: bigint): bigint {
  if (assetPeriodSeconds <= 0n) {
    throw new Error("Asset subscription duration must be positive");
  }
  const target = subscriptionPeriodToSeconds(period);
  return (target + assetPeriodSeconds - 1n) / assetPeriodSeconds;
}

export function resolveSubscriptionCount(
  input: SubscriptionPeriodCountInput,
  assetPeriodSeconds: bigint,
): bigint {
  if (input.period != null) {
    if (input.count != null) {
      throw new Error("Pass either count or period, not both");
    }
    return countForSubscriptionPeriod(input.period, assetPeriodSeconds);
  }
  if (input.count == null) {
    throw new Error("count or period is required");
  }
  if (input.count < 1n) {
    throw new Error("count must be at least 1");
  }
  return input.count;
}
