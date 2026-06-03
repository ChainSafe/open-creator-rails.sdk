import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAddress } from "viem";
import {
  createSdkIndexer,
  indexerAssetEntityId,
  resolveOpenCreatorRailsIndexerGraphqlUrl,
} from "../../indexer";
import { subscriberHash } from "../../utils";

const CHAIN_ID = 31337;
const ASSET = getAddress("0xAbCdEf1234567890123456789012345678901234");
const USER = getAddress("0x00000000000000000000000000000000000000b2");
const SUBSCRIBER_ID = "indexer_unit_test";

describe("resolveOpenCreatorRailsIndexerGraphqlUrl", () => {
  it("appends /v2/graphql to a base URL", () => {
    expect(resolveOpenCreatorRailsIndexerGraphqlUrl("https://ix.example")).toBe(
      "https://ix.example/v2/graphql",
    );
  });

  it("trims whitespace and trailing slashes", () => {
    expect(resolveOpenCreatorRailsIndexerGraphqlUrl("  https://ix.example/  ")).toBe(
      "https://ix.example/v2/graphql",
    );
  });

  it("upgrades legacy /graphql to /v2/graphql", () => {
    expect(resolveOpenCreatorRailsIndexerGraphqlUrl("https://ix.example/graphql")).toBe(
      "https://ix.example/v2/graphql",
    );
  });

  it("leaves /v2/graphql unchanged (case-insensitive)", () => {
    expect(resolveOpenCreatorRailsIndexerGraphqlUrl("https://ix.example/V2/GraphQL")).toBe(
      "https://ix.example/V2/GraphQL",
    );
  });
});

describe("indexerAssetEntityId", () => {
  it("formats chainId and lowercased address", () => {
    expect(indexerAssetEntityId(CHAIN_ID, ASSET)).toBe(
      `${CHAIN_ID}_${ASSET.toLowerCase()}`,
    );
  });
});

describe("createSdkIndexer", () => {
  const baseUrl = "https://indexer.test";
  const endpoint = resolveOpenCreatorRailsIndexerGraphqlUrl(baseUrl);
  const assetEntityId = indexerAssetEntityId(CHAIN_ID, ASSET);
  const subHex = subscriberHash(SUBSCRIBER_ID, USER);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchJson(body: unknown) {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => body,
    } as any);
  }

  it("getSubscriptionBySubscriberId maps subscription fields", async () => {
    mockFetchJson({
      data: {
        subscriptions: {
          items: [
            {
              id: `${assetEntityId}_${subHex}_0`,
              assetId: assetEntityId,
              startTime: "10",
              endTime: "20",
              nonce: "2",
              isActive: true,
              payer: USER,
            },
          ],
        },
      },
    });

    const ix = createSdkIndexer(baseUrl, { chainId: CHAIN_ID });
    const row = await ix.getSubscriptionBySubscriberId({
      assetAddress: ASSET,
      subscriberHash: subHex,
    });

    expect(fetch).toHaveBeenCalledWith(endpoint, expect.any(Object));
    expect(row).toEqual({
      id: `${assetEntityId}_${subHex}_0`,
      assetAddress: ASSET,
      subscriberId: subHex,
      payer: USER,
      isActive: true,
      startTime: 10n,
      endTime: 20n,
      nonce: 2n,
    });
  });

  it("getSubscriptionBySubscriberId uses zero address when payer is null", async () => {
    mockFetchJson({
      data: {
        subscriptions: {
          items: [
            {
              id: "x",
              assetId: assetEntityId,
              startTime: "1",
              endTime: "2",
              nonce: "0",
              isActive: false,
              payer: null,
            },
          ],
        },
      },
    });

    const ix = createSdkIndexer(baseUrl, { chainId: CHAIN_ID });
    const row = await ix.getSubscriptionBySubscriberId({
      assetAddress: ASSET,
      subscriberHash: subHex,
    });

    expect(row?.payer).toBe(getAddress(`0x${"0".repeat(40)}`));
  });

  it("getSubscription delegates to subscriber hash lookup", async () => {
    mockFetchJson({ data: { subscriptions: { items: [] } } });

    const ix = createSdkIndexer(baseUrl, { chainId: CHAIN_ID });
    const row = await ix.getSubscription({
      assetAddress: ASSET,
      subscriberId: SUBSCRIBER_ID,
      subscriberAddress: USER,
    });

    expect(row).toBeNull();
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body as string);
    expect(body.variables.subscriber).toBe(subHex.toLowerCase());
  });

  it("getAsset returns null when not indexed", async () => {
    mockFetchJson({ data: { assets: { items: [] } } });

    const ix = createSdkIndexer(baseUrl, { chainId: CHAIN_ID });
    expect(await ix.getAsset({ assetAddress: ASSET })).toBeNull();
  });

  it("getAssetOwner returns owner from asset entity", async () => {
    const owner = getAddress("0x00000000000000000000000000000000000000c3");
    mockFetchJson({
      data: {
        assets: {
          items: [
            {
              id: assetEntityId,
              assetId: "0xassetid",
              registryAddress: getAddress("0x00000000000000000000000000000000000000d4"),
              owner: owner,
              address: ASSET.toLowerCase(),
            },
          ],
        },
      },
    });

    const ix = createSdkIndexer(baseUrl, { chainId: CHAIN_ID });
    expect(await ix.getAssetOwner({ assetAddress: ASSET })).toBe(owner);
  });

  it("listSubscriptionsBySubscriberId queries activeSubscriptions when activeOnly", async () => {
    mockFetchJson({
      data: {
        activeSubscriptions: {
          items: [
            {
              id: "s1",
              assetId: assetEntityId,
              subscriber: subHex,
              payer: USER,
              startTime: "1",
              endTime: "2",
              nonce: "0",
              isActive: true,
            },
          ],
        },
      },
    });

    const ix = createSdkIndexer(baseUrl, { chainId: CHAIN_ID });
    const rows = await ix.listSubscriptionsBySubscriberId({
      subscriberHash: subHex,
      activeOnly: true,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.assetAddress).toBe(ASSET);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body: string }];
    expect(init.body as string).toContain("activeSubscriptions");
  });

  it("listSubscriptionsBySubscriberId queries subscriptions when not activeOnly", async () => {
    mockFetchJson({ data: { subscriptions: { items: [] } } });

    const ix = createSdkIndexer(baseUrl, { chainId: CHAIN_ID });
    await ix.listSubscriptionsBySubscriberId({ subscriberHash: subHex, activeOnly: false });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body: string }];
    expect(init.body as string).toContain("subscriptions(");
    expect(init.body as string).not.toContain("activeSubscriptions");
  });

  it("listAssetsByRegistry maps asset rows", async () => {
    const registry = getAddress("0x00000000000000000000000000000000000000e5");
    mockFetchJson({
      data: {
        assets: {
          items: [
            {
              id: assetEntityId,
              assetId: "0xaid",
              registryAddress: registry,
              owner: USER,
              address: ASSET.toLowerCase(),
            },
          ],
        },
      },
    });

    const ix = createSdkIndexer(baseUrl, { chainId: CHAIN_ID });
    const rows = await ix.listAssetsByRegistry({ registryAddress: registry });
    expect(rows[0]?.id).toBe(ASSET.toLowerCase());
    expect(rows[0]).toMatchObject({
      assetId: "0xaid",
      registryAddress: registry,
      owner: USER,
    });
  });

  it("throws on invalid asset entity id in subscription list", async () => {
    mockFetchJson({
      data: {
        subscriptions: {
          items: [
            {
              id: "bad",
              assetId: "not-an-entity-id",
              subscriber: subHex,
              payer: USER,
              startTime: "1",
              endTime: "2",
              nonce: "0",
              isActive: true,
            },
          ],
        },
      },
    });

    const ix = createSdkIndexer(baseUrl, { chainId: CHAIN_ID });
    await expect(
      ix.listSubscriptionsBySubscriberId({ subscriberHash: subHex }),
    ).rejects.toThrow(/Invalid asset entity id/);
  });
});
