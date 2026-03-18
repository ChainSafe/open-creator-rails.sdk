import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { AssetABI, AssetRegistryABI } from "./abis";

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

export interface SubscriptionStatus {
  isActive: boolean;
  startTime?: bigint;
  endTime?: bigint;
  nonce?: bigint;
}

export interface SubscribeWithPermitParams {
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

  async getSubscriptionOnchain(params: AccessCheckParams): Promise<SubscriptionStatus> {
    const [isActive, expiry] = await Promise.all([
      this.publicClient.readContract({
        address: this.registryAddress,
        abi: AssetRegistryABI,
        functionName: "isSubscriptionActive",
        args: [params.assetId, params.user],
      }) as Promise<boolean>,
      this.publicClient.readContract({
        address: this.registryAddress,
        abi: AssetRegistryABI,
        functionName: "getSubscription",
        args: [params.assetId, params.user],
      }) as Promise<bigint>,
    ]);

    return { isActive, endTime: expiry };
  }

  async getSubscriptionFromIndexer(params: {
    assetId: Hex;
    user: Address;
  }): Promise<SubscriptionStatus | null> {
    if (!this.indexerUrl) throw new Error("indexerUrl is not configured");

    const id = `${params.assetId.toLowerCase()}_${params.user.toLowerCase()}`;

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

  async subscribeWithPermit(params: SubscribeWithPermitParams) {
    if (!this.walletClient) throw new Error("walletClient is required");
    const account = this.walletClient.account;
    if (!account) throw new Error("walletClient.account is not set");

    const assetAddress = (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getAsset",
      args: [params.assetId],
    })) as Address;

    return this.walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "subscribe",
      chain: this.walletClient.chain ?? null,
      account,
      args: [
        params.assetId,
        params.owner,
        assetAddress,
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
      args: [params.subscriber],
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
      args: [params.subscriber],
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
      args: [params.subscriber],
    });
  }
}

export function createOcrSdk(config: OcrSdkConfig): OcrSdk {
  return new OcrSdk(config);
}

