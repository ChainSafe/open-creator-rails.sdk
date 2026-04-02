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

  it("getSubscriptionOnchain aggregates isActive + endTime", async () => {
    const publicClient = createMockPublicClient();
    const sdk = new OcrSdk({
      publicClient,
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
    });

    const assetId = mockHex("0xassetId");
    const user = mockAddress("0xuser");
    const subscriberId = subscriberToId(user);

    (publicClient.readContract as any)
      .mockResolvedValueOnce(true) // isSubscriptionActive
      .mockResolvedValueOnce(555n); // getSubscription

    const res = await sdk.getSubscriptionOnchain({ assetId, user });
    expect(res).toEqual({ isActive: true, endTime: 555n });

    expect(publicClient.readContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ functionName: "isSubscriptionActive", args: [assetId, subscriberId] }),
    );
    expect(publicClient.readContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "getSubscription", args: [assetId, subscriberId] }),
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

  it("falls back to onchain in getSubscriptionStatus when indexer request fails", async () => {
    const publicClient = createMockPublicClient();
    const sdk = new OcrSdk({
      publicClient,
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
      indexerUrl: "https://indexer.test/graphql",
    });

    const assetId = mockHex("0xassetId");
    const user = mockAddress("0xuser");

    (publicClient.readContract as any)
      .mockResolvedValueOnce(mockAddress("0xasset")) // getAsset for indexer id
      .mockResolvedValueOnce(true) // isSubscriptionActive fallback
      .mockResolvedValueOnce(123n); // getSubscription fallback

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as any);

    const res = await sdk.getSubscriptionStatus({ assetId, user, source: "auto" });
    expect(res).toEqual({ isActive: true, endTime: 123n });
  });
});

describe("OcrSdk indexer methods", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getSubscriptionFromIndexerByAssetAddress returns parsed status", async () => {
    const sdk = new OcrSdk({
      publicClient: createMockPublicClient(),
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
      indexerUrl: "https://indexer.test/graphql",
    });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          subscription: {
            isActive: true,
            startTime: "11",
            endTime: "22",
            nonce: "7",
          },
        },
      }),
    } as any);

    const res = await sdk.getSubscriptionFromIndexerByAssetAddress({
      assetAddress: mockAddress("0xasset"),
      user: mockAddress("0xuser"),
    });

    expect(res).toEqual({
      isActive: true,
      startTime: 11n,
      endTime: 22n,
      nonce: 7n,
    });
  });

  it("getSubscriptionFromIndexerByAssetAddress returns null when not found", async () => {
    const sdk = new OcrSdk({
      publicClient: createMockPublicClient(),
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
      indexerUrl: "https://indexer.test/graphql",
    });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { subscription: null } }),
    } as any);

    const res = await sdk.getSubscriptionFromIndexerByAssetAddress({
      assetAddress: mockAddress("0xasset"),
      user: mockAddress("0xuser"),
    });

    expect(res).toBeNull();
  });

  it("getAssetOwnerFromIndexer returns null when entity missing", async () => {
    const sdk = new OcrSdk({
      publicClient: createMockPublicClient(),
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
      indexerUrl: "https://indexer.test/graphql",
    });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { assetEntity: null } }),
    } as any);

    const owner = await sdk.getAssetOwnerFromIndexer({ assetAddress: mockAddress("0xasset") });
    expect(owner).toBeNull();
  });

  it("getAssetSubscriptionStatus falls back to onchain on indexer failure in auto mode", async () => {
    const publicClient = createMockPublicClient();
    const sdk = new OcrSdk({
      publicClient,
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
      indexerUrl: "https://indexer.test/graphql",
    });

    const user = mockAddress("0xuser");
    const assetAddress = mockAddress("0xasset");
    const subscriberId = subscriberToId(user);

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as any);

    (publicClient.readContract as any)
      .mockResolvedValueOnce(true) // isAssetSubscriptionActive
      .mockResolvedValueOnce(321n); // getAssetSubscription

    const res = await sdk.getAssetSubscriptionStatus({
      assetAddress,
      user,
      source: "auto",
    });

    expect(res).toEqual({ isActive: true, endTime: 321n });
    expect(publicClient.readContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ functionName: "isSubscriptionActive", args: [subscriberId] }),
    );
    expect(publicClient.readContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "getSubscription", args: [subscriberId] }),
    );
  });

  it("getAssetSubscriptionStatus throws in indexer mode when indexer fails", async () => {
    const sdk = new OcrSdk({
      publicClient: createMockPublicClient(),
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
      indexerUrl: "https://indexer.test/graphql",
    });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as any);

    await expect(
      sdk.getAssetSubscriptionStatus({
        assetAddress: mockAddress("0xasset"),
        user: mockAddress("0xuser"),
        source: "indexer",
      }),
    ).rejects.toThrow("Indexer request failed");
  });

  it("getAssetOwnerStatus falls back to onchain on indexer failure in auto mode", async () => {
    const publicClient = createMockPublicClient();
    const sdk = new OcrSdk({
      publicClient,
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
      indexerUrl: "https://indexer.test/graphql",
    });

    const assetAddress = mockAddress("0xasset");
    const onchainOwner = mockAddress("0xonchainOwner");

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as any);

    (publicClient.readContract as any).mockResolvedValueOnce(onchainOwner);

    const owner = await sdk.getAssetOwnerStatus({ assetAddress, source: "auto" });
    expect(owner).toBe(onchainOwner);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "owner", args: [] }),
    );
  });

  it("getAssetOwnerStatus throws in indexer mode when indexer fails", async () => {
    const sdk = new OcrSdk({
      publicClient: createMockPublicClient(),
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
      indexerUrl: "https://indexer.test/graphql",
    });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as any);

    await expect(
      sdk.getAssetOwnerStatus({
        assetAddress: mockAddress("0xasset"),
        source: "indexer",
      }),
    ).rejects.toThrow("Indexer request failed");
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
  it("exposes namespaced methods via sdk.AssetRegistry and sdk.Asset", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    (publicClient.readContract as any).mockResolvedValueOnce(mockAddress("0xasset"));
    (walletClient.writeContract as any).mockResolvedValueOnce("0xtxhash");

    const sdk = new OcrSdk({
      publicClient,
      walletClient,
      registryAddress: mockAddress("0xreg"),
    });

    await sdk.AssetRegistry.subscribe({
      assetId: mockHex("0xassetId"),
      owner: mockAddress("0xowner"),
      value: 1n,
      deadline: 2n,
      v: 27,
      r: mockHex("0xr"),
      s: mockHex("0xs"),
    });

    await sdk.Asset.owner({ assetAddress: mockAddress("0xasset") });

    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "subscribe" }),
    );
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "owner" }),
    );
  });

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

describe("OcrSdk full method coverage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("covers all remaining read methods", async () => {
    const publicClient = createMockPublicClient();
    const sdk = new OcrSdk({
      publicClient,
      walletClient: undefined,
      registryAddress: mockAddress("0xreg"),
      indexerUrl: "https://indexer.test/graphql",
    });

    const assetId = mockHex("0xassetId");
    const user = mockAddress("0xuser");
    const subscriberId = subscriberToId(user);
    const assetAddress = mockAddress("0xasset");

    (publicClient.readContract as any).mockResolvedValueOnce(true);
    await sdk.viewAsset({ assetId });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "viewAsset", args: [assetId] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(42n);
    await sdk.getRegistrySubscriptionPrice({ assetId, duration: 7n });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "getSubscriptionPrice", args: [assetId, 7n] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(10n);
    await sdk.getCreatorFee({ value: 100n });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "getCreatorFee", args: [100n] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(20n);
    await sdk.getRegistryFee({ value: 100n });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "getRegistryFee", args: [100n] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce([11n, 22n]);
    await sdk.getFees({ value: 100n });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "getFees", args: [100n] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce([70n, 30n, 100n]);
    await sdk.getFeeShares();
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "getFeeShares", args: [] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(70n);
    await sdk.getCreatorFeeShare();
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "getCreatorFeeShare", args: [] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(30n);
    await sdk.getRegistryFeeShare();
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "getRegistryFeeShare", args: [] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(100n);
    await sdk.getTotalFeeShare();
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "getTotalFeeShare", args: [] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(mockAddress("0xowner1"));
    await sdk.getRegistryOwner();
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "getOwner", args: [] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(mockAddress("0xowner2"));
    await sdk.owner();
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "owner", args: [] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(assetAddress);
    await sdk.assets({ assetId });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "assets", args: [assetId] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(assetAddress);
    await sdk.getAssetId({ assetAddress });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "getAssetId", args: [] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(mockAddress("0xreg2"));
    await sdk.getAssetRegistryAddress({ assetAddress });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "getRegistryAddress", args: [] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(mockAddress("0xtoken"));
    await sdk.getAssetTokenAddress({ assetAddress });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "getTokenAddress", args: [] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(77n);
    await sdk.getAssetSubscriptionPrice({ assetAddress, duration: 7n });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "getSubscriptionPrice", args: [7n] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(123n);
    await sdk.getAssetSubscription({ assetAddress, subscriber: user });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "getSubscription", args: [subscriberId] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(true);
    await sdk.isAssetSubscriptionActive({ assetAddress, subscriber: user });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({
        address: assetAddress,
        functionName: "isSubscriptionActive",
        args: [subscriberId],
      }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(mockAddress("0xassetOwner"));
    await sdk.getAssetOwner({ assetAddress });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "owner", args: [] }),
    );

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { assetEntity: { id: assetAddress.toLowerCase(), owner: mockAddress("0xix") } } }),
    } as any);
    const ixOwner = await sdk.getAssetOwnerFromIndexer({ assetAddress });
    expect(ixOwner).toBe(mockAddress("0xix"));

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { subscription: { isActive: true, startTime: "1", endTime: "2", nonce: "3" } },
      }),
    } as any);
    const ixStatus = await sdk.getAssetSubscriptionStatus({ assetAddress, user, source: "indexer" });
    expect(ixStatus).toEqual({ isActive: true, startTime: 1n, endTime: 2n, nonce: 3n });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { assetEntity: { id: assetAddress.toLowerCase(), owner: mockAddress("0xix2") } } }),
    } as any);
    const ownerStatus = await sdk.getAssetOwnerStatus({ assetAddress, source: "indexer" });
    expect(ownerStatus).toBe(mockAddress("0xix2"));

    // Bound asset helpers
    const bound = sdk.getAsset({ assetAddress });
    expect(bound.address).toBe(assetAddress);
    (publicClient.readContract as any).mockResolvedValueOnce(mockAddress("0xboundOwner"));
    await bound.owner();

    (publicClient.readContract as any).mockResolvedValueOnce(assetAddress);
    await sdk.getAssetById({ assetId });

    // Dedicated indexer namespace coverage
    expect(sdk.indexer).toBeDefined();
    const ix = sdk.indexer!;

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          subscription: { id: "sub", isActive: true, startTime: "1", endTime: "2", nonce: "3", payer: mockAddress("0xp") },
        },
      }),
    } as any);
    await ix.getSubscriptionBySubscriberId({ assetAddress, subscriberId });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          subscription: { id: "sub", isActive: true, startTime: "1", endTime: "2", nonce: "3", payer: mockAddress("0xp") },
        },
      }),
    } as any);
    await ix.getSubscription({ assetAddress, user });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          assetEntity: {
            id: assetAddress.toLowerCase(),
            assetId: assetId,
            registryAddress: mockAddress("0xreg3"),
            owner: mockAddress("0xown3"),
          },
        },
      }),
    } as any);
    await ix.getAsset({ assetAddress });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { assetEntity: { owner: mockAddress("0xown4") } } }),
    } as any);
    await ix.getAssetOwner({ assetAddress });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          subscriptions: {
            items: [
              {
                id: "s1",
                assetId: assetAddress,
                subscriber: subscriberId,
                payer: mockAddress("0xp"),
                startTime: "1",
                endTime: "2",
                nonce: "3",
                isActive: true,
              },
            ],
          },
        },
      }),
    } as any);
    await ix.listSubscriptionsBySubscriberId({ subscriberId, activeOnly: true, limit: 1, offset: 0 });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          subscriptions: {
            items: [
              {
                id: "s1",
                assetId: assetAddress,
                subscriber: subscriberId,
                payer: mockAddress("0xp"),
                startTime: "1",
                endTime: "2",
                nonce: "3",
                isActive: true,
              },
            ],
          },
        },
      }),
    } as any);
    await ix.listSubscriptionsByUser({ user, activeOnly: true, limit: 1, offset: 0 });

    vi.spyOn(globalThis, "fetch" as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          assetEntities: {
            items: [
              {
                id: assetAddress,
                assetId,
                registryAddress: mockAddress("0xreg3"),
                owner: mockAddress("0xown3"),
              },
            ],
          },
        },
      }),
    } as any);
    await ix.listAssetsByRegistry({ registryAddress: mockAddress("0xreg3"), limit: 1, offset: 0 });
  });

  it("covers all remaining write methods and namespaced wrappers", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    const sdk = new OcrSdk({
      publicClient,
      walletClient,
      registryAddress: mockAddress("0xreg"),
    });

    const assetId = mockHex("0xassetId");
    const assetAddress = mockAddress("0xasset");
    const user = mockAddress("0xuser");
    const subscriberId = subscriberToId(user);

    (walletClient.writeContract as any).mockResolvedValue("0xtxhash");

    await sdk.createAsset({
      assetId,
      subscriptionPrice: 5n,
      tokenAddress: mockAddress("0xtoken"),
      owner: mockAddress("0xowner"),
    });
    expect(walletClient.writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "createAsset" }),
    );

    await sdk.claimRegistryFeeFromRegistry({ assetId, subscriber: user });
    expect(walletClient.writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "claimRegistryFee", args: [assetId, subscriberId] }),
    );

    await sdk.updateCreatorFeeShare({ creatorFeeShare: 80n });
    expect(walletClient.writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "updateCreatorFeeShare", args: [80n] }),
    );

    await sdk.updateRegistryFeeShare({ registryFeeShare: 20n });
    expect(walletClient.writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "updateRegistryFeeShare", args: [20n] }),
    );

    await sdk.transferRegistryOwnership({ newOwner: mockAddress("0xnewOwner") });
    expect(walletClient.writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "transferOwnership" }),
    );

    await sdk.renounceRegistryOwnership();
    expect(walletClient.writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "renounceOwnership", args: [] }),
    );

    await sdk.subscribeToAsset({
      assetAddress,
      subscriber: user,
      payer: mockAddress("0xpayer"),
      spender: assetAddress,
      value: 10n,
      deadline: 20n,
      v: 27,
      r: mockHex("0xr"),
      s: mockHex("0xs"),
    });
    expect(walletClient.writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({
        address: assetAddress,
        functionName: "subscribe",
        args: [subscriberId, mockAddress("0xpayer"), assetAddress, 10n, 20n, 27, mockHex("0xr"), mockHex("0xs")],
      }),
    );

    await sdk.claimRegistryFeeOnAsset({ assetAddress, subscriber: user });
    expect(walletClient.writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "claimRegistryFee", args: [subscriberId] }),
    );

    await sdk.setAssetSubscriptionPrice({ assetAddress, newSubscriptionPrice: 99n });
    expect(walletClient.writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "setSubscriptionPrice", args: [99n] }),
    );

    await sdk.transferAssetOwnership({ assetAddress, newOwner: mockAddress("0xnewOwner2") });
    expect(walletClient.writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "transferOwnership" }),
    );

    await sdk.renounceAssetOwnership({ assetAddress });
    expect(walletClient.writeContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "renounceOwnership", args: [] }),
    );

    // Namespaced wrappers
    (publicClient.readContract as any).mockResolvedValueOnce(assetAddress);
    await sdk.AssetRegistry.getAsset({ assetId });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "getAsset", args: [assetId] }),
    );

    (publicClient.readContract as any).mockResolvedValueOnce(assetAddress);
    await sdk.Asset.getTokenAddress({ assetAddress });
    expect(publicClient.readContract).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: assetAddress, functionName: "getTokenAddress" }),
    );
  });
});

