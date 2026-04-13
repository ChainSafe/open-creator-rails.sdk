import type { Address, Hex, PublicClient, WalletClient } from "viem";

export interface OcrSdkConfig {
  /** Onchain read client (required). */
  publicClient: PublicClient;
  /** Onchain write client (optional if you only read). */
  walletClient?: WalletClient;
  /** AssetRegistry address for the current network. */
  registryAddress: Address;
  /** Optional indexer GraphQL endpoint. */
  indexerUrl?: string;
}

export type OcrAssetClient = {
  address: Address;
  getAssetId: () => Promise<Hex>;
  getRegistryAddress: () => Promise<Address>;
  getTokenAddress: () => Promise<Address>;
  getSubscriptionPrice: (params: { duration: bigint }) => Promise<bigint>;
  getSubscription: (params: { subscriber: Address }) => Promise<bigint>;
  getSubscriptionStatus: (params: { user: Address; source?: "auto" | "onchain" | "indexer" }) => Promise<SubscriptionStatus>;
  isSubscriptionActive: (params: { subscriber: Address }) => Promise<boolean>;
  owner: () => Promise<Address>;
  getOwner: (params: { source?: "auto" | "onchain" | "indexer" }) => Promise<Address>;
  subscribe: (params: {
    subscriber: Address;
    payer: Address;
    spender: Address;
    value: bigint;
    deadline: bigint;
    v: number;
    r: Hex;
    s: Hex;
  }) => Promise<Hex>;
  claimCreatorFee: (params: Omit<ClaimCreatorFeeParams, "assetAddress">) => Promise<Hex>;
  claimRegistryFee: (params: Omit<ManageSubscriptionParams, "assetAddress">) => Promise<Hex>;
  revokeSubscription: (params: Omit<ManageSubscriptionParams, "assetAddress">) => Promise<Hex>;
  cancelSubscription: (params: Omit<ManageSubscriptionParams, "assetAddress">) => Promise<Hex>;
  setSubscriptionPrice: (params: { newSubscriptionPrice: bigint }) => Promise<Hex>;
  transferOwnership: (params: { newOwner: Address }) => Promise<Hex>;
  renounceOwnership: () => Promise<Hex>;
};

export interface AccessCheckParams {
  /** bytes32 asset id hash (e.g. `assetIdHash` from deployments JSON). */
  assetId: Hex;
  /** EOA address of the user/subscriber. */
  user: Address;
  /** Prefer using the indexer when available. */
  source?: "auto" | "onchain" | "indexer";
}

export interface AssetLookupParams {
  /** bytes32 asset id hash (e.g. `assetIdHash` from deployments JSON). */
  assetId: Hex;
}

export interface OnchainAccessCheckParams {
  /** bytes32 asset id hash (e.g. `assetIdHash` from deployments JSON). */
  assetId: Hex;
  /** EOA address of the user/subscriber. */
  user: Address;
}

export interface SubscriptionStatus {
  isActive: boolean;
  startTime?: bigint;
  endTime?: bigint;
  nonce?: bigint;
}

export interface SubscribeParams {
  assetId: Hex;
  /** Permit signer / payer. */
  owner: Address;
  value: bigint;
  deadline: bigint;
  v: number;
  r: Hex;
  s: Hex;
}

export interface ClaimCreatorFeeParams {
  assetAddress: Address;
  subscriber: Address;
}

export interface ManageSubscriptionParams {
  assetAddress: Address;
  subscriber: Address;
}

// ---------------------------------------------------------------------------
// Indexer (GraphQL) types
// ---------------------------------------------------------------------------

export interface IndexerAssetEntity {
  /** Asset contract address (lowercased in the indexer, but returned here as Address). */
  id: Address;
  /** bytes32 asset id hash. */
  assetId: Hex;
  registryAddress: Address;
  owner: Address;
}

export interface IndexerSubscription {
  id: string;
  assetId: Hex;
  /** Asset contract address (resolved via `assetIdToAddresss`). */
  assetAddress: Address;
  /** bytes32 subscriber id (keccak256(address)). */
  subscriber: Hex;
  payer: Address;
  startTime: bigint;
  endTime: bigint;
  nonce: bigint;
  isActive: boolean;
}

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

