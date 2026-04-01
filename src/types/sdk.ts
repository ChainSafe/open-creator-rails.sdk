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

