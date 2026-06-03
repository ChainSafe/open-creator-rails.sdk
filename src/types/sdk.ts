import type { Address, Hex, PublicClient, WalletClient } from "viem";
import type { SubscriptionPeriod, SubscriptionPeriodCountInput } from "../subscriptionPeriod";

export type { SubscriptionPeriod, SubscriptionPeriodCountInput };

export interface OcrSdkConfig {
  /** Onchain read client (required). */
  publicClient: PublicClient;
  /** Onchain write client (optional if you only read). */
  walletClient?: WalletClient;
  /** AssetRegistry address for the current network. */
  registryAddress: Address;
  /** Optional indexer base URL or full `/v2/graphql` URL (see `resolveOpenCreatorRailsIndexerGraphqlUrl`). */
  indexerUrl?: string;
  /** Chain id for indexer composite keys; required when `indexerUrl` is set (or set `publicClient.chain`). */
  chainId?: number;
}

export type OcrAssetClient = {
  address: Address;
  getAssetId: () => Promise<Hex>;
  getRegistryAddress: () => Promise<Address>;
  getTokenAddress: () => Promise<Address>;
  getSubscriptionDuration: () => Promise<bigint>;
  getSubscriptionPrice: (params: SubscriptionPeriodCountInput) => Promise<bigint>;
  getSubscriptionPriceAndDuration: (
    params: SubscriptionPeriodCountInput,
  ) => Promise<{ price: bigint; duration: bigint }>;
  /** Resolves `count` from optional `period`, then returns on-chain price and total duration. */
  getSubscriptionQuote: (
    params: SubscriptionPeriodCountInput,
  ) => Promise<{ count: bigint; price: bigint; duration: bigint }>;
  getSubscription: (params: { subscriberId: string; subscriberAddress: Address }) => Promise<bigint>;
  getSubscriptionStatus: (params: {
    subscriberId: string;
    user: Address;
    source?: "auto" | "onchain" | "indexer";
  }) => Promise<SubscriptionStatus>;
  isSubscriptionActive: (params: { subscriberId: string; subscriberAddress: Address }) => Promise<boolean>;
  owner: () => Promise<Address>;
  getOwner: (params: { source?: "auto" | "onchain" | "indexer" }) => Promise<Address>;
  subscribe: (params: {
    subscriberId: string;
    subscriberAddress: Address;
    payer: Address;
    spender: Address;
    deadline: bigint;
    v: number;
    r: Hex;
    s: Hex;
  } & SubscriptionPeriodCountInput) => Promise<Hex>;
  claimCreatorFee: (params: { subscriberId: string; subscriberAddress: Address }) => Promise<Hex>;
  claimCreatorFeeBatch: (params: { subscribers: readonly Hex[] }) => Promise<Hex>;
  claimRegistryFee: (params: { subscriberId: string; subscriberAddress: Address }) => Promise<Hex>;
  revokeSubscription: (params: { subscriberId: string; subscriberAddress: Address }) => Promise<Hex>;
  cancelSubscription: (params: { subscriberId: string; signature: Hex }) => Promise<Hex>;
  setSubscriptionPrice: (params: { newSubscriptionPrice: bigint }) => Promise<Hex>;
  transferOwnership: (params: { newOwner: Address }) => Promise<Hex>;
  renounceOwnership: () => Promise<Hex>;
};

export interface AccessCheckParams {
  /** bytes32 asset id hash (e.g. `assetIdHash` from deployments JSON). */
  assetId: Hex;
  /** Human-readable id paired with `user` in the subscriber hash. */
  subscriberId: string;
  /** Subscriber address embedded in `keccak256(abi.encode(subscriberId, user))`. */
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
  subscriberId: string;
  /** Subscriber address embedded in the subscriber hash with `subscriberId`. */
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
  subscriberId: string;
  /** Address in the subscriber hash (cancel authority); often same as `payer`. */
  subscriberAddress: Address;
  /** Signs ERC-2612 permit and pays; refund beneficiary on cancel/revoke. */
  payer: Address;
  /** Number of full subscription periods (must be ≥ 1). Permit `value` must equal on-chain price for this count. */
  count: bigint;
  deadline: bigint;
  v: number;
  r: Hex;
  s: Hex;
}

export interface ClaimCreatorFeeParams {
  assetAddress: Address;
  subscriberId: string;
  subscriberAddress: Address;
}

export interface ManageSubscriptionParams {
  assetAddress: Address;
  subscriberId: string;
  subscriberAddress: Address;
}

export interface CancelSubscriptionParams {
  assetAddress: Address;
  subscriberId: string;
  /** EIP-191 signature over `cancelSubscriptionDigest(chainId, asset, subscriberHash(...))`. */
  signature: Hex;
}
