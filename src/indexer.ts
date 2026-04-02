import type { Address } from "viem";
import { asAddress, asHex, graphql, subscriberToId } from "./utils";
import {
  INDEXER_ASSET_ENTITY_LIST_ORDER_BY,
  INDEXER_ASSET_ENTITY_LIST_ORDER_DIRECTION,
  INDEXER_SUBSCRIPTION_LIST_ORDER_BY,
  INDEXER_SUBSCRIPTION_LIST_ORDER_DIRECTION,
  type IndexerSubscription,
  type OcrSdkIndexer,
} from "./types";

export function createSdkIndexer(indexerUrl: string): OcrSdkIndexer {
  const getSubscriptionBySubscriberId: OcrSdkIndexer["getSubscriptionBySubscriberId"] = async ({
    assetAddress,
    subscriberId,
  }) => {
    const id = `${assetAddress.toLowerCase()}_${subscriberId.toLowerCase()}`;
    const query = `
      query Subscription($id: String!) {
        subscription(id: $id) {
          id
          startTime
          endTime
          nonce
          isActive
          payer
        }
      }
    `;

    const data = await graphql<{
      subscription: null | {
        id: string;
        startTime: string;
        endTime: string;
        nonce: string;
        isActive: boolean;
        payer?: string | null;
      };
    }>(indexerUrl, query, { id });

    const sub = data.subscription;
    if (!sub) return null;

    return {
      id: sub.id,
      assetAddress,
      subscriberId,
      payer: sub.payer ? asAddress(sub.payer) : ("0x" + "0".repeat(40)) as Address,
      isActive: Boolean(sub.isActive),
      startTime: BigInt(sub.startTime),
      endTime: BigInt(sub.endTime),
      nonce: BigInt(sub.nonce),
    };
  };

  const getSubscription: OcrSdkIndexer["getSubscription"] = async ({ assetAddress, user }) => {
    const subscriberId = subscriberToId(user);
    return getSubscriptionBySubscriberId({ assetAddress, subscriberId });
  };

  const getAsset: OcrSdkIndexer["getAsset"] = async ({ assetAddress }) => {
    const query = `
      query AssetEntity($id: String!) {
        assetEntity(id: $id) {
          id
          assetId
          registryAddress
          owner
        }
      }
    `;
    const id = assetAddress.toLowerCase();

    const data = await graphql<{
      assetEntity: null | { id?: string; assetId?: string; registryAddress?: string; owner?: string };
    }>(indexerUrl, query, { id });

    const entity = data.assetEntity;
    if (!entity) return null;
    if (!entity.id || !entity.assetId || !entity.registryAddress || !entity.owner) return null;

    return {
      id: asAddress(entity.id),
      assetId: asHex(entity.assetId),
      registryAddress: asAddress(entity.registryAddress),
      owner: asAddress(entity.owner),
    };
  };

  const getAssetOwner: OcrSdkIndexer["getAssetOwner"] = async ({ assetAddress }) => {
    const query = `
      query AssetOwner($id: String!) {
        assetEntity(id: $id) {
          owner
        }
      }
    `;
    const id = assetAddress.toLowerCase();
    const data = await graphql<{ assetEntity: null | { owner?: string | null } }>(indexerUrl, query, { id });
    const owner = data.assetEntity?.owner;
    return owner ? asAddress(owner) : null;
  };

  const listSubscriptionsBySubscriberId: OcrSdkIndexer["listSubscriptionsBySubscriberId"] = async ({
    subscriberId,
    activeOnly,
    limit,
    offset,
    orderBy = INDEXER_SUBSCRIPTION_LIST_ORDER_BY,
    orderDirection = INDEXER_SUBSCRIPTION_LIST_ORDER_DIRECTION,
  }) => {
    const query = `
      query SubscriptionsBySubscriber(
        $subscriber: String!
        $limit: Int
        $offset: Int
        $orderBy: String!
        $orderDirection: String!
      ) {
        subscriptions(
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
          }
        }
      }
    `;

    const data = await graphql<{
      subscriptions: { items: Array<any> } | null;
    }>(indexerUrl, query, {
      subscriber: subscriberId,
      limit: limit ?? 100,
      offset: offset ?? 0,
      orderBy,
      orderDirection,
    });

    const items = data.subscriptions?.items ?? [];
    const mapped: IndexerSubscription[] = items.map((sub: any) => ({
      id: String(sub.id),
      assetAddress: asAddress(sub.assetId),
      subscriberId: asHex(sub.subscriber),
      payer: asAddress(sub.payer),
      isActive: Boolean(sub.isActive),
      startTime: BigInt(sub.startTime),
      endTime: BigInt(sub.endTime),
      nonce: BigInt(sub.nonce),
    }));

    return activeOnly ? mapped.filter((s) => s.isActive) : mapped;
  };

  const listSubscriptionsByUser: OcrSdkIndexer["listSubscriptionsByUser"] = async ({
    user,
    activeOnly,
    limit,
    offset,
    orderBy,
    orderDirection,
  }) => {
    const subscriberId = subscriberToId(user);
    return listSubscriptionsBySubscriberId({
      subscriberId,
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
        $registryAddress: String!
        $limit: Int
        $offset: Int
        $orderBy: String!
        $orderDirection: String!
      ) {
        assetEntitys(
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
          }
        }
      }
    `;

    const data = await graphql<{
      assetEntitys: { items: Array<any> } | null;
    }>(indexerUrl, query, {
      registryAddress: registryAddress.toLowerCase(),
      limit: limit ?? 100,
      offset: offset ?? 0,
      orderBy,
      orderDirection,
    });

    const items = data.assetEntitys?.items ?? [];
    return items.map((e: any) => ({
      id: asAddress(e.id),
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

