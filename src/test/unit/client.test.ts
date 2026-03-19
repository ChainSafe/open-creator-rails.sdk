import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAddress, keccak256, stringToHex } from "viem";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { OcrSdk } from "../../client";
import { subscriberToId } from "../../utils";

function mockAddress(label: string = "0x1"): Address {
  const normalized = label.toLowerCase();

  // If the label is already hex-ish, normalize it into a 20-byte address.
  if (/^0x[0-9a-f]{1,40}$/.test(normalized)) {
    const hex = normalized.replace(/^0x/, "");
    const padded = hex.padStart(40, "0");
    return getAddress(`0x${padded}`) as Address;
  }

  // Otherwise, derive a deterministic address from the label text.
  const hash = keccak256(stringToHex(label));
  const addr = `0x${hash.slice(-40)}`;
  return getAddress(addr) as Address;
}

function mockHex(label: string = "0x1234"): Hex {
  return label as Hex;
}

function createMockPublicClient(): PublicClient {
  return {
    readContract: vi.fn(),
  } as unknown as PublicClient;
}

function createMockWalletClient(withAccount: boolean = true): WalletClient {
  return {
    writeContract: vi.fn(),
    account: withAccount ? mockAddress("0xacc") : undefined,
    chain: null,
  } as unknown as WalletClient;
}

describe("OcrSdk.getSubscriptionStatus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers indexer when source='indexer'", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    const indexerUrl = "https://indexer.test/graphql";

    const sdk = new OcrSdk({
      publicClient,
      walletClient,
      registryAddress: mockAddress(),
      indexerUrl,
    });

    (publicClient.readContract as any).mockResolvedValueOnce(mockAddress("0xasset"));

    const assetId = mockHex();
    const user = mockAddress("0xuser");

    const fakeResponse = {
      ok: true,
      json: async () => ({
        data: {
          subscription: {
            isActive: true,
            startTime: "100",
            endTime: "200",
            nonce: "3",
          },
        },
      }),
    } as any;

    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValue(fakeResponse);

    const result = await sdk.getSubscriptionStatus({
      assetId,
      user,
      source: "indexer",
    });

    expect(fetchSpy).toHaveBeenCalledWith(indexerUrl, expect.any(Object));
    expect(result).toEqual({
      isActive: true,
      startTime: 100n,
      endTime: 200n,
      nonce: 3n,
    });
  });

  it("falls back to onchain when indexer returns null", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    const indexerUrl = "https://indexer.test/graphql";

    const sdk = new OcrSdk({
      publicClient,
      walletClient,
      registryAddress: mockAddress(),
      indexerUrl,
    });

    const assetId = mockHex();
    const user = mockAddress("0xuser");

    (publicClient.readContract as any)
      .mockResolvedValueOnce(mockAddress("0xasset")) // getAsset (for indexer id)
      .mockResolvedValueOnce(true) // isSubscriptionActive
      .mockResolvedValueOnce(200n); // getSubscription

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { subscription: null } }),
    } as any);

    const result = await sdk.getSubscriptionStatus({
      assetId,
      user,
      source: "auto",
    });

    expect(result).toEqual({ isActive: true, endTime: 200n });
    expect((publicClient.readContract as any).mock.calls.length).toBe(3);
  });

  it("uses onchain only when source='onchain'", async () => {
    const publicClient = createMockPublicClient();
    const sdk = new OcrSdk({
      publicClient,
      walletClient: undefined,
      registryAddress: mockAddress(),
    });

    const assetId = mockHex();
    const user = mockAddress("0xuser");

    (publicClient.readContract as any)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(0n);

    const result = await sdk.getSubscriptionStatus({
      assetId,
      user,
      source: "onchain",
    });

    expect(result).toEqual({ isActive: false, endTime: 0n });
  });
});

describe("OcrSdk registry helpers", () => {
  it("getAssetAddress calls registry.getAsset", async () => {
    const publicClient = createMockPublicClient();
    const assetAddress = mockAddress("0xasset");
    (publicClient.readContract as any).mockResolvedValue(assetAddress);

    const sdk = new OcrSdk({
      publicClient,
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
    });

    const assetId = mockHex();
    const res = await sdk.getAssetAddress({ assetId });

    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: mockAddress("0xreg"),
        functionName: "getAsset",
        args: [assetId],
      }),
    );
    expect(res).toBe(assetAddress);
  });

  it("isSubscriptionActiveOnchain calls registry.isSubscriptionActive", async () => {
    const publicClient = createMockPublicClient();
    (publicClient.readContract as any).mockResolvedValue(true);

    const sdk = new OcrSdk({
      publicClient,
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
    });

    const assetId = mockHex();
    const user = mockAddress("0xuser");
    const subscriberId = subscriberToId(user);

    const active = await sdk.isSubscriptionActiveOnchain({ assetId, user });

    expect(active).toBe(true);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "isSubscriptionActive",
        args: [assetId, subscriberId],
      }),
    );
  });

  it("getSubscriptionEndTimeOnchain calls registry.getSubscription", async () => {
    const publicClient = createMockPublicClient();
    (publicClient.readContract as any).mockResolvedValue(999n);

    const sdk = new OcrSdk({
      publicClient,
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
    });

    const assetId = mockHex();
    const user = mockAddress("0xuser");
    const subscriberId = subscriberToId(user);

    const endTime = await sdk.getSubscriptionEndTimeOnchain({ assetId, user });

    expect(endTime).toBe(999n);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getSubscription",
        args: [assetId, subscriberId],
      }),
    );
  });
});

describe("OcrSdk.getSubscriptionFromIndexer", () => {
  it("throws when indexerUrl is not configured", async () => {
    const sdk = new OcrSdk({
      publicClient: createMockPublicClient(),
      walletClient: undefined,
      registryAddress: mockAddress(),
      indexerUrl: undefined,
    });

    await expect(
      sdk.getSubscriptionFromIndexer({
        assetId: mockHex(),
        user: mockAddress("0xuser"),
      }),
    ).rejects.toThrow("indexerUrl is not configured");
  });

  it("returns null when subscription not found", async () => {
    const publicClient = createMockPublicClient();
    const indexerUrl = "https://indexer.test/graphql";

    const sdk = new OcrSdk({
      publicClient,
      walletClient: undefined,
      registryAddress: mockAddress(),
      indexerUrl,
    });

    (publicClient.readContract as any).mockResolvedValueOnce(mockAddress("0xasset"));

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { subscription: null } }),
    } as any);

    const res = await sdk.getSubscriptionFromIndexer({
      assetId: mockHex(),
      user: mockAddress("0xuser"),
    });

    expect(res).toBeNull();
  });
});

describe("OcrSdk write methods - error cases", () => {
  it("subscribe throws if walletClient missing", async () => {
    const sdk = new OcrSdk({
      publicClient: createMockPublicClient(),
      walletClient: undefined,
      registryAddress: mockAddress(),
    });

    await expect(
      sdk.subscribe({
        assetId: mockHex(),
        owner: mockAddress("0xowner"),
        value: 1n,
        deadline: 2n,
        v: 27,
        r: mockHex(),
        s: mockHex(),
      }),
    ).rejects.toThrow("walletClient is required");
  });

  it("claimCreatorFee throws if account not set", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient(false);

    const sdk = new OcrSdk({
      publicClient,
      walletClient,
      registryAddress: mockAddress(),
    });

    await expect(
      sdk.claimCreatorFee({
        assetAddress: mockAddress("0xasset"),
        subscriber: mockAddress("0xsub"),
      }),
    ).rejects.toThrow("walletClient.account is not set");
  });
});

describe("OcrSdk write methods - happy paths", () => {
  it("subscribe calls registry.subscribe with derived asset address", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();

    (publicClient.readContract as any).mockResolvedValueOnce(
      mockAddress("0xasset"),
    );
    (walletClient.writeContract as any).mockResolvedValueOnce("0xtxhash");

    const sdk = new OcrSdk({
      publicClient,
      walletClient,
      registryAddress: mockAddress("0xreg"),
    });

    const params = {
      assetId: mockHex("0xassetId"),
      owner: mockAddress("0xowner"),
      value: 1n,
      deadline: 2n,
      v: 27,
      r: mockHex("0xr"),
      s: mockHex("0xs"),
    };

    const subscriberId = subscriberToId(params.owner);
    const res = await sdk.subscribe(params);

    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: mockAddress("0xreg"),
        functionName: "getAsset",
        args: [params.assetId],
      }),
    );
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: mockAddress("0xreg"),
        functionName: "subscribe",
        args: [
          params.assetId,
          subscriberId,
          params.owner, // payer
          mockAddress("0xasset"), // spender (asset contract)
          params.value,
          params.deadline,
          params.v,
          params.r,
          params.s,
        ],
      }),
    );
    expect(res).toBe("0xtxhash");
  });

  it("claimCreatorFee calls Asset.claimCreatorFee", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    (walletClient.writeContract as any).mockResolvedValueOnce("0xtxhash");

    const sdk = new OcrSdk({
      publicClient,
      walletClient,
      registryAddress: mockAddress("0xreg"),
    });

    const params = {
      assetAddress: mockAddress("0xasset"),
      subscriber: mockAddress("0xsub"),
    };

    const subscriberId = subscriberToId(params.subscriber);
    const res = await sdk.claimCreatorFee(params);

    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: params.assetAddress,
        functionName: "claimCreatorFee",
        args: [subscriberId],
      }),
    );
    expect(res).toBe("0xtxhash");
  });

  it("revokeSubscription calls Asset.revokeSubscription", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();

    const sdk = new OcrSdk({
      publicClient,
      walletClient,
      registryAddress: mockAddress("0xreg"),
    });

    await sdk.revokeSubscription({
      assetAddress: mockAddress("0xasset"),
      subscriber: mockAddress("0xsub"),
    });

    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "revokeSubscription",
      }),
    );
  });

  it("cancelSubscription calls Asset.cancelSubscription", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();

    const sdk = new OcrSdk({
      publicClient,
      walletClient,
      registryAddress: mockAddress("0xreg"),
    });

    await sdk.cancelSubscription({
      assetAddress: mockAddress("0xasset"),
      subscriber: mockAddress("0xsub"),
    });

    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "cancelSubscription",
      }),
    );
  });
});

