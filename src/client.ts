import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { AssetABI } from "./config/AssetABI";
import { AssetRegistryABI } from "./config/AssetRegistryABI";
import type {
  AccessCheckParams,
  AssetLookupParams,
  ClaimCreatorFeeParams,
  ManageSubscriptionParams,
  OcrSdkConfig,
  OnchainAccessCheckParams,
  SubscribeParams,
  SubscriptionStatus,
} from "./types";
import { subscriberToId } from "./utils";

export class OcrSdk {
  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;
  private readonly registryAddress: Address;
  private readonly indexerUrl?: string;

  constructor(config: OcrSdkConfig) {
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
    this.registryAddress = config.registryAddress;
    this.indexerUrl = config.indexerUrl;
  }

  async getSubscriptionStatus(params: AccessCheckParams): Promise<SubscriptionStatus> {
    const source = params.source ?? "auto";

    if (source === "indexer" || (source === "auto" && this.indexerUrl)) {
      if (!this.indexerUrl) throw new Error("indexerUrl is not configured");
      const fromIndexer = await this.getSubscriptionFromIndexer({
        assetId: params.assetId,
        user: params.user,
      });
      if (fromIndexer) return fromIndexer;
    }

    return this.getSubscriptionOnchain(params);
  }

  /**
   * Onchain lookup for an asset's contract address by id.
   * This is useful when you want to call `Asset` methods (e.g. fee claims) and only have an `assetId`.
   */
  async getAssetAddress(params: AssetLookupParams): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getAsset",
      args: [params.assetId],
    })) as Address;
  }

  /** Onchain access check: whether the subscription is currently active. */
  async isSubscriptionActiveOnchain(params: OnchainAccessCheckParams): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "isSubscriptionActive",
      args: [params.assetId, subscriberToId(params.user)],
    })) as boolean;
  }

  /**
   * Onchain subscription expiry timestamp (seconds since epoch), as stored in the registry.
   * Note: this returns the raw registry value; use `isSubscriptionActiveOnchain` for an "active right now" check.
   */
  async getSubscriptionEndTimeOnchain(params: OnchainAccessCheckParams): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getSubscription",
      args: [params.assetId, subscriberToId(params.user)],
    })) as bigint;
  }

  async getSubscriptionOnchain(params: AccessCheckParams): Promise<SubscriptionStatus> {
    const [isActive, expiry] = await Promise.all([
      this.isSubscriptionActiveOnchain({ assetId: params.assetId, user: params.user }),
      this.getSubscriptionEndTimeOnchain({ assetId: params.assetId, user: params.user }),
    ]);

    return { isActive, endTime: expiry };
  }

  async getSubscriptionFromIndexer(params: {
    assetId: Hex;
    user: Address;
  }): Promise<SubscriptionStatus | null> {
    if (!this.indexerUrl) throw new Error("indexerUrl is not configured");

    const subscriberId = subscriberToId(params.user);
    const assetAddress = await this.getAssetAddress({ assetId: params.assetId });
    const id = `${assetAddress.toLowerCase()}_${subscriberId.toLowerCase()}`;

    const query = `
      query Subscription($id: String!) {
        subscription(id: $id) {
          id
          startTime
          endTime
          nonce
          isActive
        }
      }
    `;

    const response = await fetch(this.indexerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { id } }),
    });

    if (!response.ok) {
      throw new Error(`Indexer request failed with status ${response.status}`);
    }

    const json = await response.json();
    const sub = json.data?.subscription;
    if (!sub) return null;

    return {
      isActive: Boolean(sub.isActive),
      startTime: BigInt(sub.startTime),
      endTime: BigInt(sub.endTime),
      nonce: BigInt(sub.nonce),
    };
  }

  async subscribe(params: SubscribeParams) {
    if (!this.walletClient) throw new Error("walletClient is required");
    const account = this.walletClient.account;
    if (!account) throw new Error("walletClient.account is not set");

    const assetAddress = await this.getAssetAddress({ assetId: params.assetId });
    const subscriberId = subscriberToId(params.owner);

    return this.walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "subscribe",
      chain: this.walletClient.chain ?? null,
      account,
      args: [
        params.assetId,
        subscriberId,
        params.owner, // payer
        assetAddress, // spender must be the asset contract address
        params.value,
        params.deadline,
        params.v,
        params.r,
        params.s,
      ],
    });
  }

  async claimCreatorFee(params: ClaimCreatorFeeParams) {
    if (!this.walletClient) throw new Error("walletClient is required");
    const account = this.walletClient.account;
    if (!account) throw new Error("walletClient.account is not set");

    return this.walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "claimCreatorFee",
      chain: this.walletClient.chain ?? null,
      account,
      args: [subscriberToId(params.subscriber)],
    });
  }

  async revokeSubscription(params: ManageSubscriptionParams) {
    if (!this.walletClient) throw new Error("walletClient is required");
    const account = this.walletClient.account;
    if (!account) throw new Error("walletClient.account is not set");

    return this.walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "revokeSubscription",
      chain: this.walletClient.chain ?? null,
      account,
      args: [subscriberToId(params.subscriber)],
    });
  }

  async cancelSubscription(params: ManageSubscriptionParams) {
    if (!this.walletClient) throw new Error("walletClient is required");
    const account = this.walletClient.account;
    if (!account) throw new Error("walletClient.account is not set");

    return this.walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "cancelSubscription",
      chain: this.walletClient.chain ?? null,
      account,
      args: [subscriberToId(params.subscriber)],
    });
  }
}
