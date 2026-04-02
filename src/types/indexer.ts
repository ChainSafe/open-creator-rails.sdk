import type { Address, Hex } from "viem";
import type { SubscriptionStatus } from "./sdk";

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
  }) => Promise<IndexerSubscription[]>;
  listSubscriptionsByUser: (params: {
    user: Address;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  }) => Promise<IndexerSubscription[]>;
  listAssetsByRegistry: (params: {
    registryAddress: Address;
    limit?: number;
    offset?: number;
  }) => Promise<IndexerAssetEntity[]>;
};

