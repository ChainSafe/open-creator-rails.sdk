import type { Address, Hex } from "viem";
import type { SubscriptionStatus } from "./sdk";

/** Ponder GraphQL `orderDirection` argument (see https://ponder.sh/docs/query/graphql). */
export type IndexerOrderDirection = "asc" | "desc";

/** Default sort for `subscriptions` list queries. */
export const INDEXER_SUBSCRIPTION_LIST_ORDER_BY = "endTime" as const;
export const INDEXER_SUBSCRIPTION_LIST_ORDER_DIRECTION: IndexerOrderDirection = "desc";

/** Default sort for `assetEntitys` list queries. */
export const INDEXER_ASSET_ENTITY_LIST_ORDER_BY = "id" as const;
export const INDEXER_ASSET_ENTITY_LIST_ORDER_DIRECTION: IndexerOrderDirection = "asc";

/** Indexer namespace types (GraphQL-backed). */
export type IndexerSubscription = SubscriptionStatus & {
  /** `${assetAddress.toLowerCase()}_${subscriberId.toLowerCase()}` */
  id: string;
  assetAddress: Address;
  subscriberId: Hex;
  payer: Address;
};

export type IndexerAssetEntity = {
  /** Asset contract address (lowercased in the indexer DB) */
  id: Address;
  assetId: Hex;
  registryAddress: Address;
  owner: Address;
};

export type OcrSdkIndexer = {
  getSubscription: (params: { assetAddress: Address; user: Address }) => Promise<IndexerSubscription | null>;
  getSubscriptionBySubscriberId: (params: {
    assetAddress: Address;
    subscriberId: Hex;
  }) => Promise<IndexerSubscription | null>;
  getAsset: (params: { assetAddress: Address }) => Promise<IndexerAssetEntity | null>;
  getAssetOwner: (params: { assetAddress: Address }) => Promise<Address | null>;
  listSubscriptionsBySubscriberId: (params: {
    subscriberId: Hex;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: IndexerOrderDirection;
  }) => Promise<IndexerSubscription[]>;
  listSubscriptionsByUser: (params: {
    user: Address;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: IndexerOrderDirection;
  }) => Promise<IndexerSubscription[]>;
  listAssetsByRegistry: (params: {
    registryAddress: Address;
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: IndexerOrderDirection;
  }) => Promise<IndexerAssetEntity[]>;
};

// ---------------------------------------------------------------------------
// Indexer (GraphQL) event types
// ---------------------------------------------------------------------------

export interface IndexerAssetCreatedEvent {
  id: string;
  assetId: Hex;
  asset: Address;
  subscriptionPrice: bigint;
  tokenAddress: Address;
  owner: Address;
  registryAddress: Address;
  blockNumber: bigint;
  blockTimestamp: bigint;
}

export interface IndexerAssetSubscriptionAddedEvent {
  id: string;
  subscriber: Hex;
  payer: Address;
  startTime: bigint;
  endTime: bigint;
  nonce: bigint;
  assetAddress: Address;
  blockNumber: bigint;
  blockTimestamp: bigint;
}

export interface IndexerAssetSubscriptionPriceUpdatedEvent {
  id: string;
  newSubscriptionPrice: bigint;
  assetAddress: Address;
  blockNumber: bigint;
  blockTimestamp: bigint;
}

export interface IndexerAssetOwnershipTransferredEvent {
  id: string;
  previousOwner: Address;
  newOwner: Address;
  assetAddress: Address;
  blockNumber: bigint;
  blockTimestamp: bigint;
}

