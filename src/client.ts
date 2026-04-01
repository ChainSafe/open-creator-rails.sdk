import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { AssetABI } from "./config/AssetABI";
import { AssetRegistryABI } from "./config/AssetRegistryABI";
import type { OcrSdkIndexer } from "./types";
import { createSdkIndexer } from "./indexer";
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

export class OcrSdk {
  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;
  private readonly registryAddress: Address;
  private readonly indexerUrl?: string;
  public readonly indexer?: OcrSdkIndexer;
  // Namespaced API: wrappers for AssetRegistry contract methods.
  public readonly AssetRegistry: {
    getAsset: (params: AssetLookupParams) => Promise<Address>;
    viewAsset: (params: AssetLookupParams) => Promise<boolean>;
    isSubscriptionActive: (params: OnchainAccessCheckParams) => Promise<boolean>;
    getSubscription: (params: OnchainAccessCheckParams) => Promise<bigint>;
    getSubscriptionPrice: (params: { assetId: Hex; duration: bigint }) => Promise<bigint>;
    getCreatorFee: (params: { value: bigint }) => Promise<bigint>;
    getRegistryFee: (params: { value: bigint }) => Promise<bigint>;
    getFees: (params: { value: bigint }) => Promise<{ creatorFee: bigint; registryFee: bigint }>;
    getFeeShares: () => Promise<{
      creatorFeeShare: bigint;
      registryFeeShare: bigint;
      totalFeeShare: bigint;
    }>;
    getCreatorFeeShare: () => Promise<bigint>;
    getRegistryFeeShare: () => Promise<bigint>;
    getTotalFeeShare: () => Promise<bigint>;
    getOwner: () => Promise<Address>;
    owner: () => Promise<Address>;
    assets: (params: AssetLookupParams) => Promise<Address>;
    createAsset: (params: {
      assetId: Hex;
      subscriptionPrice: bigint;
      tokenAddress: Address;
      owner: Address;
    }) => Promise<Hex>;
    subscribe: (params: SubscribeParams) => Promise<Hex>;
    claimRegistryFee: (params: { assetId: Hex; subscriber: Address }) => Promise<Hex>;
    updateCreatorFeeShare: (params: { creatorFeeShare: bigint }) => Promise<Hex>;
    updateRegistryFeeShare: (params: { registryFeeShare: bigint }) => Promise<Hex>;
    transferOwnership: (params: { newOwner: Address }) => Promise<Hex>;
    renounceOwnership: () => Promise<Hex>;
  };
  // Namespaced API: wrappers for Asset contract methods.
  public readonly Asset: {
    getAssetId: (params: { assetAddress: Address }) => Promise<Hex>;
    getRegistryAddress: (params: { assetAddress: Address }) => Promise<Address>;
    getTokenAddress: (params: { assetAddress: Address }) => Promise<Address>;
    getSubscriptionPrice: (params: { assetAddress: Address; duration: bigint }) => Promise<bigint>;
    getSubscription: (params: { assetAddress: Address; subscriber: Address }) => Promise<bigint>;
    getSubscriptionStatus: (params: {
      assetAddress: Address;
      user: Address;
      source?: "auto" | "onchain" | "indexer";
    }) => Promise<SubscriptionStatus>;
    isSubscriptionActive: (params: { assetAddress: Address; subscriber: Address }) => Promise<boolean>;
    owner: (params: { assetAddress: Address }) => Promise<Address>;
    getOwner: (params: {
      assetAddress: Address;
      source?: "auto" | "onchain" | "indexer";
    }) => Promise<Address>;
    subscribe: (params: {
      assetAddress: Address;
      subscriber: Address;
      payer: Address;
      spender: Address;
      value: bigint;
      deadline: bigint;
      v: number;
      r: Hex;
      s: Hex;
    }) => Promise<Hex>;
    claimCreatorFee: (params: ClaimCreatorFeeParams) => Promise<Hex>;
    claimRegistryFee: (params: { assetAddress: Address; subscriber: Address }) => Promise<Hex>;
    revokeSubscription: (params: ManageSubscriptionParams) => Promise<Hex>;
    cancelSubscription: (params: ManageSubscriptionParams) => Promise<Hex>;
    setSubscriptionPrice: (params: { assetAddress: Address; newSubscriptionPrice: bigint }) => Promise<Hex>;
    transferOwnership: (params: { assetAddress: Address; newOwner: Address }) => Promise<Hex>;
    renounceOwnership: (params: { assetAddress: Address }) => Promise<Hex>;
  };

  constructor(config: OcrSdkConfig) {
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
    this.registryAddress = config.registryAddress;
    this.indexerUrl = config.indexerUrl;
    this.indexer = config.indexerUrl ? createSdkIndexer(config.indexerUrl) : undefined;
    // AssetRegistry namespace bindings.
    this.AssetRegistry = {
      getAsset: (params) => this.getAssetAddress(params),
      viewAsset: (params) => this.viewAsset(params),
      isSubscriptionActive: (params) => this.isSubscriptionActiveOnchain(params),
      getSubscription: (params) => this.getSubscriptionEndTimeOnchain(params),
      getSubscriptionPrice: (params) => this.getRegistrySubscriptionPrice(params),
      getCreatorFee: (params) => this.getCreatorFee(params),
      getRegistryFee: (params) => this.getRegistryFee(params),
      getFees: (params) => this.getFees(params),
      getFeeShares: () => this.getFeeShares(),
      getCreatorFeeShare: () => this.getCreatorFeeShare(),
      getRegistryFeeShare: () => this.getRegistryFeeShare(),
      getTotalFeeShare: () => this.getTotalFeeShare(),
      getOwner: () => this.getRegistryOwner(),
      owner: () => this.owner(),
      assets: (params) => this.assets(params),
      createAsset: (params) => this.createAsset(params) as Promise<Hex>,
      subscribe: (params) => this.subscribe(params) as Promise<Hex>,
      claimRegistryFee: (params) => this.claimRegistryFeeFromRegistry(params) as Promise<Hex>,
      updateCreatorFeeShare: (params) => this.updateCreatorFeeShare(params) as Promise<Hex>,
      updateRegistryFeeShare: (params) => this.updateRegistryFeeShare(params) as Promise<Hex>,
      transferOwnership: (params) => this.transferRegistryOwnership(params) as Promise<Hex>,
      renounceOwnership: () => this.renounceRegistryOwnership() as Promise<Hex>,
    };
    // Asset namespace bindings.
    this.Asset = {
      getAssetId: (params) => this.getAssetId(params),
      getRegistryAddress: (params) => this.getAssetRegistryAddress(params),
      getTokenAddress: (params) => this.getAssetTokenAddress(params),
      getSubscriptionPrice: (params) => this.getAssetSubscriptionPrice(params),
      getSubscription: (params) => this.getAssetSubscription(params),
      getSubscriptionStatus: (params) => this.getAssetSubscriptionStatus(params),
      isSubscriptionActive: (params) => this.isAssetSubscriptionActive(params),
      owner: (params) => this.getAssetOwner(params),
      getOwner: (params) => this.getAssetOwnerStatus(params),
      subscribe: (params) => this.subscribeToAsset(params) as Promise<Hex>,
      claimCreatorFee: (params) => this.claimCreatorFee(params) as Promise<Hex>,
      claimRegistryFee: (params) => this.claimRegistryFeeOnAsset(params) as Promise<Hex>,
      revokeSubscription: (params) => this.revokeSubscription(params) as Promise<Hex>,
      cancelSubscription: (params) => this.cancelSubscription(params) as Promise<Hex>,
      setSubscriptionPrice: (params) => this.setAssetSubscriptionPrice(params) as Promise<Hex>,
      transferOwnership: (params) => this.transferAssetOwnership(params) as Promise<Hex>,
      renounceOwnership: (params) => this.renounceAssetOwnership(params) as Promise<Hex>,
    };
  }

  private getWalletContext() {
    if (!this.walletClient) throw new Error("walletClient is required");
    const walletClient = this.walletClient;
    const account = walletClient.account;
    if (!account) throw new Error("walletClient.account is not set");
    return { walletClient, account };
  }

  async getSubscriptionStatus(params: AccessCheckParams): Promise<SubscriptionStatus> {
    const source = params.source ?? "auto";

    if (source === "indexer" || (source === "auto" && this.indexerUrl)) {
      if (!this.indexerUrl || !this.indexer) throw new Error("indexerUrl is not configured");
      try {
        const fromIndexer = await this.getSubscriptionFromIndexer({
          assetId: params.assetId,
          user: params.user,
        });
        if (fromIndexer) return fromIndexer;
      } catch {
        if (source === "indexer") throw new Error("Indexer request failed");
      }
    }

    return this.getSubscriptionOnchain(params);
  }

  /**
   * Returns "asset client" bound to `assetAddress`.
   */
  getAsset(params: { assetAddress: Address }): OcrAssetClient {
    const assetAddress = params.assetAddress;
    return {
      address: assetAddress,
      getAssetId: () => this.Asset.getAssetId({ assetAddress }),
      getRegistryAddress: () => this.Asset.getRegistryAddress({ assetAddress }),
      getTokenAddress: () => this.Asset.getTokenAddress({ assetAddress }),
      getSubscriptionPrice: ({ duration }) => this.Asset.getSubscriptionPrice({ assetAddress, duration }),
      getSubscription: ({ subscriber }) => this.Asset.getSubscription({ assetAddress, subscriber }),
      getSubscriptionStatus: ({ user, source }) => this.Asset.getSubscriptionStatus({ assetAddress, user, source }),
      isSubscriptionActive: ({ subscriber }) => this.Asset.isSubscriptionActive({ assetAddress, subscriber }),
      owner: () => this.Asset.owner({ assetAddress }),
      getOwner: ({ source }) => this.Asset.getOwner({ assetAddress, source }),
      subscribe: (p) => this.Asset.subscribe({ assetAddress, ...p }),
      claimCreatorFee: (p) => this.Asset.claimCreatorFee({ assetAddress, ...p }),
      claimRegistryFee: (p) => this.Asset.claimRegistryFee({ assetAddress, ...p }),
      revokeSubscription: (p) => this.Asset.revokeSubscription({ assetAddress, ...p }),
      cancelSubscription: (p) => this.Asset.cancelSubscription({ assetAddress, ...p }),
      setSubscriptionPrice: (p) => this.Asset.setSubscriptionPrice({ assetAddress, ...p }),
      transferOwnership: (p) => this.Asset.transferOwnership({ assetAddress, ...p }),
      renounceOwnership: () => this.Asset.renounceOwnership({ assetAddress }),
    };
  }

  async getAssetById(params: { assetId: Hex }): Promise<OcrAssetClient> {
    const assetAddress = await this.getAssetAddress({ assetId: params.assetId });
    return this.getAsset({ assetAddress });
  }

  // ---------------------------------------------------------------------------
  // Indexer methods
  // ---------------------------------------------------------------------------

  async getSubscriptionFromIndexer(params: {
    assetId: Hex;
    user: Address;
  }): Promise<SubscriptionStatus | null> {
    if (!this.indexer) throw new Error("indexerUrl is not configured");

    const subscriberId = subscriberToId(params.user);
    const assetAddress = await this.getAssetAddress({ assetId: params.assetId });
    return this.getSubscriptionFromIndexerByAssetAddress({ assetAddress, user: params.user, subscriberId });
  }

  async getSubscriptionFromIndexerByAssetAddress(params: {
    assetAddress: Address;
    user: Address;
    subscriberId?: Hex;
  }): Promise<SubscriptionStatus | null> {
    if (!this.indexer) throw new Error("indexerUrl is not configured");
    const subscriberId = params.subscriberId ?? subscriberToId(params.user);
    const sub = await this.indexer.getSubscriptionBySubscriberId({
      assetAddress: params.assetAddress,
      subscriberId,
    });
    if (!sub) return null;
    return { isActive: sub.isActive, startTime: sub.startTime, endTime: sub.endTime, nonce: sub.nonce };
  }

  async getAssetOwnerFromIndexer(params: { assetAddress: Address }): Promise<Address | null> {
    if (!this.indexer) throw new Error("indexerUrl is not configured");
    return this.indexer.getAssetOwner({ assetAddress: params.assetAddress });
  }

  // ---------------------------------------------------------------------------
  // AssetRegistry methods
  // ---------------------------------------------------------------------------

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

  async viewAsset(params: AssetLookupParams): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "viewAsset",
      args: [params.assetId],
    })) as boolean;
  }

  async getRegistrySubscriptionPrice(params: { assetId: Hex; duration: bigint }): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getSubscriptionPrice",
      args: [params.assetId, params.duration],
    })) as bigint;
  }

  async getCreatorFee(params: { value: bigint }): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getCreatorFee",
      args: [params.value],
    })) as bigint;
  }

  async getRegistryFee(params: { value: bigint }): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getRegistryFee",
      args: [params.value],
    })) as bigint;
  }

  async getFees(params: { value: bigint }): Promise<{ creatorFee: bigint; registryFee: bigint }> {
    const [creatorFee, registryFee] = (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getFees",
      args: [params.value],
    })) as [bigint, bigint];
    return { creatorFee, registryFee };
  }

  async getFeeShares(): Promise<{
    creatorFeeShare: bigint;
    registryFeeShare: bigint;
    totalFeeShare: bigint;
  }> {
    const [creatorFeeShare, registryFeeShare, totalFeeShare] = (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getFeeShares",
      args: [],
    })) as [bigint, bigint, bigint];
    return { creatorFeeShare, registryFeeShare, totalFeeShare };
  }

  async getCreatorFeeShare(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getCreatorFeeShare",
      args: [],
    })) as bigint;
  }

  async getRegistryFeeShare(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getRegistryFeeShare",
      args: [],
    })) as bigint;
  }

  async getTotalFeeShare(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getTotalFeeShare",
      args: [],
    })) as bigint;
  }

  async getRegistryOwner(): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getOwner",
      args: [],
    })) as Address;
  }

  async owner(): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "owner",
      args: [],
    })) as Address;
  }

  async assets(params: AssetLookupParams): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "assets",
      args: [params.assetId],
    })) as Address;
  }

  async createAsset(params: {
    assetId: Hex;
    subscriptionPrice: bigint;
    tokenAddress: Address;
    owner: Address;
  }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "createAsset",
      chain: walletClient.chain ?? null,
      account,
      args: [params.assetId, params.subscriptionPrice, params.tokenAddress, params.owner],
    });
  }

  async subscribe(params: SubscribeParams) {
    const { walletClient, account } = this.getWalletContext();

    const assetAddress = await this.getAssetAddress({ assetId: params.assetId });
    const subscriberId = subscriberToId(params.owner);

    return walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "subscribe",
      chain: walletClient.chain ?? null,
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

  async claimRegistryFeeFromRegistry(params: { assetId: Hex; subscriber: Address }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "claimRegistryFee",
      chain: walletClient.chain ?? null,
      account,
      args: [params.assetId, subscriberToId(params.subscriber)],
    });
  }

  async updateCreatorFeeShare(params: { creatorFeeShare: bigint }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "updateCreatorFeeShare",
      chain: walletClient.chain ?? null,
      account,
      args: [params.creatorFeeShare],
    });
  }

  async updateRegistryFeeShare(params: { registryFeeShare: bigint }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "updateRegistryFeeShare",
      chain: walletClient.chain ?? null,
      account,
      args: [params.registryFeeShare],
    });
  }

  async transferRegistryOwnership(params: { newOwner: Address }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "transferOwnership",
      chain: walletClient.chain ?? null,
      account,
      args: [params.newOwner],
    });
  }

  async renounceRegistryOwnership() {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "renounceOwnership",
      chain: walletClient.chain ?? null,
      account,
      args: [],
    });
  }

  // ---------------------------------------------------------------------------
  // Asset methods
  // ---------------------------------------------------------------------------

  async getAssetId(params: { assetAddress: Address }): Promise<Hex> {
    return (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "getAssetId",
      args: [],
    })) as Hex;
  }

  async getAssetRegistryAddress(params: { assetAddress: Address }): Promise<Address> {
    return (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "getRegistryAddress",
      args: [],
    })) as Address;
  }

  async getAssetTokenAddress(params: { assetAddress: Address }): Promise<Address> {
    return (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "getTokenAddress",
      args: [],
    })) as Address;
  }

  async getAssetSubscriptionPrice(params: { assetAddress: Address; duration: bigint }): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "getSubscriptionPrice",
      args: [params.duration],
    })) as bigint;
  }

  async getAssetSubscription(params: { assetAddress: Address; subscriber: Address }): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "getSubscription",
      args: [subscriberToId(params.subscriber)],
    })) as bigint;
  }

  async getAssetSubscriptionStatus(params: {
    assetAddress: Address;
    user: Address;
    source?: "auto" | "onchain" | "indexer";
  }): Promise<SubscriptionStatus> {
    const source = params.source ?? "auto";

    if (source === "indexer" || (source === "auto" && this.indexerUrl)) {
      if (!this.indexerUrl || !this.indexer) throw new Error("indexerUrl is not configured");
      try {
        const fromIndexer = await this.getSubscriptionFromIndexerByAssetAddress({
          assetAddress: params.assetAddress,
          user: params.user,
        });
        if (fromIndexer) return fromIndexer;
      } catch {
        if (source === "indexer") throw new Error("Indexer request failed");
      }
    }

    const [isActive, endTime] = await Promise.all([
      this.isAssetSubscriptionActive({ assetAddress: params.assetAddress, subscriber: params.user }),
      this.getAssetSubscription({ assetAddress: params.assetAddress, subscriber: params.user }),
    ]);
    return { isActive, endTime };
  }

  async isAssetSubscriptionActive(params: {
    assetAddress: Address;
    subscriber: Address;
  }): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "isSubscriptionActive",
      args: [subscriberToId(params.subscriber)],
    })) as boolean;
  }

  async getAssetOwner(params: { assetAddress: Address }): Promise<Address> {
    return (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "owner",
      args: [],
    })) as Address;
  }

  async getAssetOwnerStatus(params: {
    assetAddress: Address;
    source?: "auto" | "onchain" | "indexer";
  }): Promise<Address> {
    const source = params.source ?? "auto";

    if (source === "indexer" || (source === "auto" && this.indexerUrl)) {
      if (!this.indexerUrl || !this.indexer) throw new Error("indexerUrl is not configured");
      try {
        const ownerFromIndexer = await this.getAssetOwnerFromIndexer({ assetAddress: params.assetAddress });
        if (ownerFromIndexer) return ownerFromIndexer;
      } catch {
        if (source === "indexer") throw new Error("Indexer request failed");
      }
    }

    return this.getAssetOwner({ assetAddress: params.assetAddress });
  }

  async subscribeToAsset(params: {
    assetAddress: Address;
    subscriber: Address;
    payer: Address;
    spender: Address;
    value: bigint;
    deadline: bigint;
    v: number;
    r: Hex;
    s: Hex;
  }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "subscribe",
      chain: walletClient.chain ?? null,
      account,
      args: [
        subscriberToId(params.subscriber),
        params.payer,
        params.spender,
        params.value,
        params.deadline,
        params.v,
        params.r,
        params.s,
      ],
    });
  }

  async claimCreatorFee(params: ClaimCreatorFeeParams) {
    const { walletClient, account } = this.getWalletContext();

    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "claimCreatorFee",
      chain: walletClient.chain ?? null,
      account,
      args: [subscriberToId(params.subscriber)],
    });
  }

  async claimRegistryFeeOnAsset(params: { assetAddress: Address; subscriber: Address }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "claimRegistryFee",
      chain: walletClient.chain ?? null,
      account,
      args: [subscriberToId(params.subscriber)],
    });
  }

  async revokeSubscription(params: ManageSubscriptionParams) {
    const { walletClient, account } = this.getWalletContext();

    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "revokeSubscription",
      chain: walletClient.chain ?? null,
      account,
      args: [subscriberToId(params.subscriber)],
    });
  }

  async cancelSubscription(params: ManageSubscriptionParams) {
    const { walletClient, account } = this.getWalletContext();

    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "cancelSubscription",
      chain: walletClient.chain ?? null,
      account,
      args: [subscriberToId(params.subscriber)],
    });
  }

  async setAssetSubscriptionPrice(params: { assetAddress: Address; newSubscriptionPrice: bigint }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "setSubscriptionPrice",
      chain: walletClient.chain ?? null,
      account,
      args: [params.newSubscriptionPrice],
    });
  }

  async transferAssetOwnership(params: { assetAddress: Address; newOwner: Address }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "transferOwnership",
      chain: walletClient.chain ?? null,
      account,
      args: [params.newOwner],
    });
  }

  async renounceAssetOwnership(params: { assetAddress: Address }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "renounceOwnership",
      chain: walletClient.chain ?? null,
      account,
      args: [],
    });
  }
}
