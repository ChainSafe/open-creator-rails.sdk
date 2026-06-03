import { describe, it, expect, vi, beforeEach } from "vitest";
import { encodeAbiParameters, getAddress, keccak256 } from "viem";
import {
  asAddress,
  asHex,
  cancelSubscriptionDigest,
  graphql,
  subscriberHash,
} from "../../utils";

const CHAIN_ID = 31337;
const ASSET = getAddress("0x00000000000000000000000000000000000000a1");
const USER = getAddress("0x00000000000000000000000000000000000000b2");

describe("subscriberHash", () => {
  it("is deterministic for the same subscriber id and address", () => {
    const a = subscriberHash("user-1", USER);
    const b = subscriberHash("user-1", USER);
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("differs when subscriber id or address changes", () => {
    const base = subscriberHash("user-1", USER);
    expect(subscriberHash("user-2", USER)).not.toBe(base);
    expect(subscriberHash("user-1", getAddress("0x00000000000000000000000000000000000000c3"))).not.toBe(
      base,
    );
  });

  it("matches viem abi.encode + keccak256", () => {
    const id = "integration_subscriber";
    const expected = keccak256(
      encodeAbiParameters(
        [
          { type: "string", name: "subscriberId" },
          { type: "address", name: "subscriberAddress" },
        ],
        [id, USER],
      ),
    );
    expect(subscriberHash(id, USER)).toBe(expected);
  });
});

describe("cancelSubscriptionDigest", () => {
  it("packs chain id, asset address, and subscriber hash", () => {
    const subscriber = subscriberHash("sub", USER);
    const digest = cancelSubscriptionDigest(CHAIN_ID, ASSET, subscriber);
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(cancelSubscriptionDigest(CHAIN_ID, ASSET, subscriber)).toBe(digest);
    expect(cancelSubscriptionDigest(CHAIN_ID + 1, ASSET, subscriber)).not.toBe(digest);
  });
});

describe("asAddress / asHex", () => {
  it("accepts valid strings", () => {
    expect(asAddress(ASSET)).toBe(ASSET);
    expect(asHex("0xabc")).toBe("0xabc");
  });

  it("rejects non-string values", () => {
    expect(() => asAddress(1)).toThrow("Expected address string");
    expect(() => asHex(null)).toThrow("Expected hex string");
  });
});

describe("graphql", () => {
  const endpoint = "https://indexer.test/v2/graphql";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns data on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ok: true } }),
    } as any);

    const data = await graphql<{ ok: boolean }>(endpoint, "query {}", {});
    expect(data).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("throws on non-OK HTTP status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as any);

    await expect(graphql(endpoint, "query {}", {})).rejects.toThrow(
      "Indexer request failed with status 503",
    );
  });

  it("throws with GraphQL error messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        errors: [{ message: "bad field" }, { message: "other" }],
      }),
    } as any);

    await expect(graphql(endpoint, "query {}", {})).rejects.toThrow(
      "Indexer GraphQL error: bad field; other",
    );
  });

  it("throws generic GraphQL error when messages are missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{}] }),
    } as any);

    await expect(graphql(endpoint, "query {}", {})).rejects.toThrow("Indexer GraphQL error");
  });

  it("throws when response has no data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as any);

    await expect(graphql(endpoint, "query {}", {})).rejects.toThrow(
      "Indexer response missing data",
    );
  });
});
