import type { Address } from "viem";
import { getAddress } from "viem";
import { asAddress, asHex, graphql, subscriberHash } from "./utils";
import {
  INDEXER_ASSET_ENTITY_LIST_ORDER_BY,
  INDEXER_ASSET_ENTITY_LIST_ORDER_DIRECTION,
  INDEXER_SUBSCRIPTION_LIST_ORDER_BY,
  INDEXER_SUBSCRIPTION_LIST_ORDER_DIRECTION,
  type IndexerSubscription,
  type OcrSdkIndexer,
} from "./types";

/** Matches `open-creator-rails.indexer` / `getAssetEntityId`. */
export function indexerAssetEntityId(chainId: number, assetAddress: Address): string {
  return `${chainId}_${assetAddress.toLowerCase()}`;
}

function assetContractAddressFromEntityId(assetEntityId: string): Address {
  const sep = assetEntityId.indexOf("_");
  if (sep === -1) throw new Error(`Invalid asset entity id: ${assetEntityId}`);
  return getAddress(assetEntityId.slice(sep + 1) as `0x${string}`);
}

/**
 * Normalizes a user-provided base URL to the GraphQL endpoint used by
 * `open-creator-rails.indexer` (`/v2/graphql`). If the URL already ends with
 * `/v2/graphql`, it is returned unchanged.
 */
export function resolveOpenCreatorRailsIndexerGraphqlUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (/\/v2\/graphql$/i.test(trimmed)) return trimmed;
  if (/\/graphql$/i.test(trimmed)) {
    return trimmed.replace(/\/graphql$/i, "/v2/graphql");
  }
  return `${trimmed}/v2/graphql`;
}

export type CreateSdkIndexerOptions = {
  /** Must match the chain the indexer is syncing (see `ponder.config.ts`). */
  chainId: number;
};

export function createSdkIndexer(indexerUrl: string, options: CreateSdkIndexerOptions): OcrSdkIndexer {
  const endpoint = resolveOpenCreatorRailsIndexerGraphqlUrl(indexerUrl);
  const { chainId } = options;

  const getSubscriptionBySubscriberId: OcrSdkIndexer["getSubscriptionBySubscriberId"] = async ({
    assetAddress,
    subscriberHash: subscriberHashHex,
  }) => {
    const assetEntityId = indexerAssetEntityId(chainId, assetAddress);
    const query = `
      query LatestSubscription($assetId: String!, $subscriber: String!) {
        subscriptions(
          where: { assetId: $assetId, subscriber: $subscriber }
          orderBy: "nonce"
          orderDirection: "desc"
          limit: 1
          offset: 0
        ) {
          items {
            id
            assetId
            startTime
            endTime
            nonce
            isActive
            isRevoked
            payer
          }
        }
      }
    `;

    const data = await graphql<{
      subscriptions: null | {
        items: Array<{
          id: string;
          assetId: string;
          startTime: string;
          endTime: string;
          nonce: string;
          isActive: boolean;
          payer?: string | null;
        }>;
      };
    }>(endpoint, query, {
      assetId: assetEntityId,
      subscriber: subscriberHashHex.toLowerCase(),
    });

    const item = data.subscriptions?.items?.[0];
    if (!item) return null;

    const resolvedAssetAddress = assetContractAddressFromEntityId(item.assetId);

    return {
      id: item.id,
      assetAddress: resolvedAssetAddress,
      subscriberId: subscriberHashHex,
      payer: item.payer ? asAddress(item.payer) : ("0x" + "0".repeat(40)) as Address,
      isActive: Boolean(item.isActive),
      isRevoked: Boolean((item as any).isRevoked),
      startTime: BigInt(item.startTime),
      endTime: BigInt(item.endTime),
      nonce: BigInt(item.nonce),
    };
  };

  const getSubscription: OcrSdkIndexer["getSubscription"] = async ({
    assetAddress,
    subscriberId,
    subscriberAddress,
  }) => {
    const h = subscriberHash(subscriberId, subscriberAddress);
    return getSubscriptionBySubscriberId({ assetAddress, subscriberHash: h });
  };

  const getAsset: OcrSdkIndexer["getAsset"] = async ({ assetAddress }) => {
    const query = `
      query AssetByAddress($address: Address!) {
        assets(where: { address: $address }, limit: 1, offset: 0) {
          items {
            id
            assetId
            registryAddress
            owner
            address
          }
        }
      }
    `;

    const data = await graphql<{
      assets: null | {
        items: Array<{
          id: string;
          assetId: string;
          registryAddress: string;
          owner: string;
          address: string;
        }>;
      };
    }>(endpoint, query, { address: assetAddress.toLowerCase() });

    const entity = data.assets?.items?.[0];
    if (!entity) return null;

    return {
      id: asAddress(entity.address),
      assetId: asHex(entity.assetId),
      registryAddress: asAddress(entity.registryAddress),
      owner: asAddress(entity.owner),
    };
  };

  const getAssetOwner: OcrSdkIndexer["getAssetOwner"] = async ({ assetAddress }) => {
    const row = await getAsset({ assetAddress });
    return row?.owner ?? null;
  };

  const listSubscriptionsBySubscriberId: OcrSdkIndexer["listSubscriptionsBySubscriberId"] = async ({
    subscriberHash: subscriberHashHex,
    activeOnly,
    limit,
    offset,
    orderBy = INDEXER_SUBSCRIPTION_LIST_ORDER_BY,
    orderDirection = INDEXER_SUBSCRIPTION_LIST_ORDER_DIRECTION,
  }) => {
    const rootField = activeOnly ? "activeSubscriptions" : "subscriptions";
    const query = `
      query SubscriptionsBySubscriber(
        $subscriber: String!
        $limit: Int
        $offset: Int
        $orderBy: String!
        $orderDirection: String!
      ) {
        ${rootField}(
          where: { subscriber: $subscriber }
          orderBy: $orderBy
          orderDirection: $orderDirection
          limit: $limit
          offset: $offset
        ) {
          items {
            id
            assetId
            subscriber
            payer
            startTime
            endTime
            nonce
            isActive
            isRevoked
          }
        }
      }
    `;

    const data = await graphql<{
      subscriptions?: { items: Array<any> } | null;
      activeSubscriptions?: { items: Array<any> } | null;
    }>(endpoint, query, {
      subscriber: subscriberHashHex.toLowerCase(),
      limit: limit ?? 100,
      offset: offset ?? 0,
      orderBy,
      orderDirection,
    });

    const page = activeOnly ? data.activeSubscriptions : data.subscriptions;
    const items = page?.items ?? [];
    const mapped: IndexerSubscription[] = items.map((sub: any) => ({
      id: String(sub.id),
      assetAddress: assetContractAddressFromEntityId(String(sub.assetId)),
      subscriberId: asHex(sub.subscriber),
      payer: asAddress(sub.payer),
      isActive: Boolean(sub.isActive),
      isRevoked: Boolean(sub.isRevoked),
      startTime: BigInt(sub.startTime),
      endTime: BigInt(sub.endTime),
      nonce: BigInt(sub.nonce),
    }));

    return mapped;
  };

  const listSubscriptionsByUser: OcrSdkIndexer["listSubscriptionsByUser"] = async ({
    user,
    subscriberId,
    activeOnly,
    limit,
    offset,
    orderBy,
    orderDirection,
  }) => {
    const h = subscriberHash(subscriberId, user);
    return listSubscriptionsBySubscriberId({
      subscriberHash: h,
      activeOnly,
      limit,
      offset,
      orderBy,
      orderDirection,
    });
  };

  const listAssetsByRegistry: OcrSdkIndexer["listAssetsByRegistry"] = async ({
    registryAddress,
    limit,
    offset,
    orderBy = INDEXER_ASSET_ENTITY_LIST_ORDER_BY,
    orderDirection = INDEXER_ASSET_ENTITY_LIST_ORDER_DIRECTION,
  }) => {
    const query = `
      query AssetsByRegistry(
        $registryAddress: Address!
        $limit: Int
        $offset: Int
        $orderBy: String!
        $orderDirection: String!
      ) {
        assets(
          where: { registryAddress: $registryAddress }
          orderBy: $orderBy
          orderDirection: $orderDirection
          limit: $limit
          offset: $offset
        ) {
          items {
            id
            assetId
            registryAddress
            owner
            address
          }
        }
      }
    `;

    const data = await graphql<{
      assets: { items: Array<any> } | null;
    }>(endpoint, query, {
      registryAddress: registryAddress.toLowerCase(),
      limit: limit ?? 100,
      offset: offset ?? 0,
      orderBy,
      orderDirection,
    });

    const items = data.assets?.items ?? [];
    return items.map((e: any) => ({
      id: asAddress(e.address),
      assetId: asHex(e.assetId),
      registryAddress: asAddress(e.registryAddress),
      owner: asAddress(e.owner),
    }));
  };

  return {
    getSubscription,
    getSubscriptionBySubscriberId,
    getAsset,
    getAssetOwner,
    listSubscriptionsBySubscriberId,
    listSubscriptionsByUser,
    listAssetsByRegistry,
  };
}
