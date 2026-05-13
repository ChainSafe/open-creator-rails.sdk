import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { AssetABI } from "./config/AssetABI";
import { AssetRegistryABI } from "./config/AssetRegistryABI";
import type { OcrAssetClient, OcrSdkIndexer } from "./types";
import { createSdkIndexer } from "./indexer";
import type {
  AccessCheckParams,
  AssetLookupParams,
  CancelSubscriptionParams,
  ClaimCreatorFeeParams,
  ManageSubscriptionParams,
  OcrSdkConfig,
  OnchainAccessCheckParams,
  SubscribeParams,
  SubscriptionStatus,
} from "./types";
import { subscriberHash } from "./utils";

export class OcrSdk {
  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;
  private readonly registryAddress: Address;
  private readonly indexerUrl?: string;
  public readonly indexer?: OcrSdkIndexer;
  public readonly AssetRegistry: {
    getAsset: (params: AssetLookupParams) => Promise<Address>;
    viewAsset: (params: AssetLookupParams) => Promise<boolean>;
    isSubscriptionActive: (params: OnchainAccessCheckParams) => Promise<boolean>;
    getSubscription: (params: OnchainAccessCheckParams) => Promise<bigint>;
    getSubscriptionPrice: (params: { assetId: Hex; count: bigint }) => Promise<bigint>;
    getSubscriptionDuration: (params: AssetLookupParams) => Promise<bigint>;
    getSubscriptionPriceAndDuration: (params: {
      assetId: Hex;
      count: bigint;
    }) => Promise<{ price: bigint; duration: bigint }>;
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
      subscriptionDuration: bigint;
      tokenAddress: Address;
      owner: Address;
    }) => Promise<Hex>;
    subscribe: (params: SubscribeParams) => Promise<Hex>;
    claimRegistryFee: (params: {
      assetId: Hex;
      subscriberId: string;
      subscriberAddress: Address;
    }) => Promise<Hex>;
    claimRegistryFeeBatch: (params: { assetId: Hex; subscribers: readonly Hex[] }) => Promise<Hex>;
    updateRegistryFeeShare: (params: { registryFeeShare: bigint }) => Promise<Hex>;
    transferOwnership: (params: { newOwner: Address }) => Promise<Hex>;
    renounceOwnership: () => Promise<Hex>;
  };
  public readonly Asset: {
    getAssetId: (params: { assetAddress: Address }) => Promise<Hex>;
    getRegistryAddress: (params: { assetAddress: Address }) => Promise<Address>;
    getTokenAddress: (params: { assetAddress: Address }) => Promise<Address>;
    getSubscriptionDuration: (params: { assetAddress: Address }) => Promise<bigint>;
    getSubscriptionPrice: (params: { assetAddress: Address; count: bigint }) => Promise<bigint>;
    getSubscriptionPriceAndDuration: (params: {
      assetAddress: Address;
      count: bigint;
    }) => Promise<{ price: bigint; duration: bigint }>;
    getSubscription: (params: {
      assetAddress: Address;
      subscriberId: string;
      subscriberAddress: Address;
    }) => Promise<bigint>;
    getSubscriptionStatus: (params: {
      assetAddress: Address;
      subscriberId: string;
      user: Address;
      source?: "auto" | "onchain" | "indexer";
    }) => Promise<SubscriptionStatus>;
    isSubscriptionActive: (params: {
      assetAddress: Address;
      subscriberId: string;
      subscriberAddress: Address;
    }) => Promise<boolean>;
    owner: (params: { assetAddress: Address }) => Promise<Address>;
    getOwner: (params: {
      assetAddress: Address;
      source?: "auto" | "onchain" | "indexer";
    }) => Promise<Address>;
    subscribe: (params: {
      assetAddress: Address;
      subscriberId: string;
      subscriberAddress: Address;
      payer: Address;
      spender: Address;
      count: bigint;
      deadline: bigint;
      v: number;
      r: Hex;
      s: Hex;
    }) => Promise<Hex>;
    claimCreatorFee: (params: ClaimCreatorFeeParams) => Promise<Hex>;
    claimCreatorFeeBatch: (params: { assetAddress: Address; subscribers: readonly Hex[] }) => Promise<Hex>;
    claimRegistryFee: (params: ManageSubscriptionParams) => Promise<Hex>;
    revokeSubscription: (params: ManageSubscriptionParams) => Promise<Hex>;
    cancelSubscription: (params: CancelSubscriptionParams) => Promise<Hex>;
    setSubscriptionPrice: (params: { assetAddress: Address; newSubscriptionPrice: bigint }) => Promise<Hex>;
    transferOwnership: (params: { assetAddress: Address; newOwner: Address }) => Promise<Hex>;
    renounceOwnership: (params: { assetAddress: Address }) => Promise<Hex>;
  };

  constructor(config: OcrSdkConfig) {
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
    this.registryAddress = config.registryAddress;
    this.indexerUrl = config.indexerUrl;
    const chainIdForIndexer = config.chainId ?? config.publicClient.chain?.id;
    if (config.indexerUrl != null && chainIdForIndexer == null) {
      throw new Error(
        "OcrSdk: indexerUrl requires a chain id — set config.chainId or use a publicClient with a configured chain.",
      );
    }
    this.indexer =
      config.indexerUrl != null && chainIdForIndexer != null
        ? createSdkIndexer(config.indexerUrl, { chainId: chainIdForIndexer })
        : undefined;
    this.AssetRegistry = {
      getAsset: (params) => this.getAssetAddress(params),
      viewAsset: (params) => this.viewAsset(params),
      isSubscriptionActive: (params) => this.isSubscriptionActiveOnchain(params),
      getSubscription: (params) => this.getSubscriptionEndTimeOnchain(params),
      getSubscriptionPrice: (params) => this.getRegistrySubscriptionPrice(params),
      getSubscriptionDuration: (params) => this.getRegistrySubscriptionDuration(params),
      getSubscriptionPriceAndDuration: (params) => this.getRegistrySubscriptionPriceAndDuration(params),
      getCreatorFee: (params) => this.getCreatorFee(params),
      getRegistryFee: (params) => this.getRegistryFee(params),
      getFees: (params) => this.getFees(params),
      getFeeShares: () => this.getFeeShares(),
      getCreatorFeeShare: () => this.getCreatorFeeShare(),
      getRegistryFeeShare: () => this.getRegistryFeeShare(),
      getTotalFeeShare: () => this.getTotalFeeShare(),
      getOwner: () => this.getRegistryOwner(),
      owner: () => this.getRegistryOwnerFromOwnable(),
      assets: (params) => this.assets(params),
      createAsset: (params) => this.createAsset(params) as Promise<Hex>,
      subscribe: (params) => this.subscribe(params) as Promise<Hex>,
      claimRegistryFee: (params) => this.claimRegistryFeeFromRegistry(params) as Promise<Hex>,
      claimRegistryFeeBatch: (params) => this.claimRegistryFeeBatchFromRegistry(params) as Promise<Hex>,
      updateRegistryFeeShare: (params) => this.updateRegistryFeeShare(params) as Promise<Hex>,
      transferOwnership: (params) => this.transferRegistryOwnership(params) as Promise<Hex>,
      renounceOwnership: () => this.renounceRegistryOwnership() as Promise<Hex>,
    };
    this.Asset = {
      getAssetId: (params) => this.getAssetId(params),
      getRegistryAddress: (params) => this.getAssetRegistryAddress(params),
      getTokenAddress: (params) => this.getAssetTokenAddress(params),
      getSubscriptionDuration: (params) => this.getAssetSubscriptionDuration(params),
      getSubscriptionPrice: (params) => this.getAssetSubscriptionPrice(params),
      getSubscriptionPriceAndDuration: (params) => this.getAssetSubscriptionPriceAndDuration(params),
      getSubscription: (params) => this.getAssetSubscription(params),
      getSubscriptionStatus: (params) => this.getAssetSubscriptionStatus(params),
      isSubscriptionActive: (params) => this.isAssetSubscriptionActive(params),
      owner: (params) => this.getAssetOwner(params),
      getOwner: (params) => this.getAssetOwnerStatus(params),
      subscribe: (params) => this.subscribeToAsset(params) as Promise<Hex>,
      claimCreatorFee: (params) => this.claimCreatorFee(params) as Promise<Hex>,
      claimCreatorFeeBatch: (params) => this.claimCreatorFeeBatch(params) as Promise<Hex>,
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

  private subscriberBytes32(params: { subscriberId: string; user: Address }): Hex {
    return subscriberHash(params.subscriberId, params.user);
  }

  async getSubscriptionStatus(params: AccessCheckParams): Promise<SubscriptionStatus> {
    const source = params.source ?? "auto";

    if (source === "indexer" || (source === "auto" && this.indexerUrl)) {
      if (!this.indexerUrl || !this.indexer) throw new Error("indexerUrl is not configured");
      try {
        const fromIndexer = await this.getSubscriptionFromIndexer({
          assetId: params.assetId,
          subscriberId: params.subscriberId,
          user: params.user,
        });
        if (fromIndexer) return fromIndexer;
      } catch {
        if (source === "indexer") throw new Error("Indexer request failed");
      }
    }

    return this.getSubscriptionOnchain(params);
  }

  getAsset(params: { assetAddress: Address }): OcrAssetClient {
    const assetAddress = params.assetAddress;
    return {
      address: assetAddress,
      getAssetId: () => this.Asset.getAssetId({ assetAddress }),
      getRegistryAddress: () => this.Asset.getRegistryAddress({ assetAddress }),
      getTokenAddress: () => this.Asset.getTokenAddress({ assetAddress }),
      getSubscriptionDuration: () => this.Asset.getSubscriptionDuration({ assetAddress }),
      getSubscriptionPrice: ({ count }) => this.Asset.getSubscriptionPrice({ assetAddress, count }),
      getSubscriptionPriceAndDuration: ({ count }) =>
        this.Asset.getSubscriptionPriceAndDuration({ assetAddress, count }),
      getSubscription: ({ subscriberId, subscriberAddress }) =>
        this.Asset.getSubscription({ assetAddress, subscriberId, subscriberAddress }),
      getSubscriptionStatus: ({ subscriberId, user, source }) =>
        this.Asset.getSubscriptionStatus({ assetAddress, subscriberId, user, source }),
      isSubscriptionActive: ({ subscriberId, subscriberAddress }) =>
        this.Asset.isSubscriptionActive({ assetAddress, subscriberId, subscriberAddress }),
      owner: () => this.Asset.owner({ assetAddress }),
      getOwner: ({ source }) => this.Asset.getOwner({ assetAddress, source }),
      subscribe: (p) => this.Asset.subscribe({ assetAddress, ...p }),
      claimCreatorFee: (p) => this.Asset.claimCreatorFee({ assetAddress, ...p }),
      claimCreatorFeeBatch: (p) => this.Asset.claimCreatorFeeBatch({ assetAddress, ...p }),
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
    subscriberId: string;
    user: Address;
  }): Promise<SubscriptionStatus | null> {
    if (!this.indexer) throw new Error("indexerUrl is not configured");

    const assetAddress = await this.getAssetAddress({ assetId: params.assetId });
    return this.getSubscriptionFromIndexerByAssetAddress({
      assetAddress,
      subscriberId: params.subscriberId,
      user: params.user,
    });
  }

  async getSubscriptionFromIndexerByAssetAddress(params: {
    assetAddress: Address;
    subscriberId: string;
    user: Address;
  }): Promise<SubscriptionStatus | null> {
    if (!this.indexer) throw new Error("indexerUrl is not configured");
    const sub = await this.indexer.getSubscription({
      assetAddress: params.assetAddress,
      subscriberId: params.subscriberId,
      subscriberAddress: params.user,
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

  async getAssetAddress(params: AssetLookupParams): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getAsset",
      args: [params.assetId],
    })) as Address;
  }

  async isSubscriptionActiveOnchain(params: OnchainAccessCheckParams): Promise<boolean> {
    const sub = this.subscriberBytes32(params);
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "isSubscriptionActive",
      args: [params.assetId, sub],
    })) as boolean;
  }

  async getSubscriptionEndTimeOnchain(params: OnchainAccessCheckParams): Promise<bigint> {
    const sub = this.subscriberBytes32(params);
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getSubscription",
      args: [params.assetId, sub],
    })) as bigint;
  }

  async getSubscriptionOnchain(params: AccessCheckParams): Promise<SubscriptionStatus> {
    const [isActive, expiry] = await Promise.all([
      this.isSubscriptionActiveOnchain({
        assetId: params.assetId,
        subscriberId: params.subscriberId,
        user: params.user,
      }),
      this.getSubscriptionEndTimeOnchain({
        assetId: params.assetId,
        subscriberId: params.subscriberId,
        user: params.user,
      }),
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

  async getRegistrySubscriptionPrice(params: { assetId: Hex; count: bigint }): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getSubscriptionPrice",
      args: [params.assetId, params.count],
    })) as bigint;
  }

  async getRegistrySubscriptionDuration(params: AssetLookupParams): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getSubscriptionDuration",
      args: [params.assetId],
    })) as bigint;
  }

  async getRegistrySubscriptionPriceAndDuration(params: {
    assetId: Hex;
    count: bigint;
  }): Promise<{ price: bigint; duration: bigint }> {
    const [price, duration] = (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getSubscriptionPriceAndDuration",
      args: [params.assetId, params.count],
    })) as [bigint, bigint];
    return { price, duration };
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
    const raw = (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getFeeShares",
      args: [],
    })) as unknown;
    let tuple: readonly bigint[];
    if (Array.isArray(raw)) {
      tuple = raw as readonly bigint[];
    } else if (raw && typeof raw === "object") {
      const o = raw as Record<string, bigint>;
      tuple = [0, 1].map((i) => o[String(i)]).filter((v): v is bigint => typeof v === "bigint");
    } else {
      throw new Error("unexpected getFeeShares return shape");
    }
    const creatorFeeShare = tuple[0]!;
    const registryFeeShare = tuple[1]!;
    const totalFeeShare = creatorFeeShare + registryFeeShare;
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
    const [c, r] = await Promise.all([this.getCreatorFeeShare(), this.getRegistryFeeShare()]);
    return c + r;
  }

  async getRegistryOwner(): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "getOwner",
      args: [],
    })) as Address;
  }

  /** Ownable `owner()` on the registry (same role as {@link getRegistryOwner}; may differ if overridden). */
  async owner(): Promise<Address> {
    return this.getRegistryOwnerFromOwnable();
  }

  async getRegistryOwnerFromOwnable(): Promise<Address> {
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
    subscriptionDuration: bigint;
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
      args: [
        params.assetId,
        params.subscriptionPrice,
        params.subscriptionDuration,
        params.tokenAddress,
        params.owner,
      ],
    });
  }

  async subscribe(params: SubscribeParams) {
    const { walletClient, account } = this.getWalletContext();

    const assetAddress = await this.getAssetAddress({ assetId: params.assetId });
    const sub = subscriberHash(params.subscriberId, params.subscriberAddress);

    return walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "subscribe",
      chain: walletClient.chain ?? null,
      account,
      args: [
        params.assetId,
        sub,
        params.payer,
        assetAddress,
        params.count,
        params.deadline,
        params.v,
        params.r,
        params.s,
      ],
    });
  }

  async claimRegistryFeeFromRegistry(params: {
    assetId: Hex;
    subscriberId: string;
    subscriberAddress: Address;
  }) {
    const { walletClient, account } = this.getWalletContext();
    const sub = subscriberHash(params.subscriberId, params.subscriberAddress);
    return walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "claimRegistryFee",
      chain: walletClient.chain ?? null,
      account,
      args: [params.assetId, sub],
    });
  }

  async claimRegistryFeeBatchFromRegistry(params: { assetId: Hex; subscribers: readonly Hex[] }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: this.registryAddress,
      abi: AssetRegistryABI,
      functionName: "claimRegistryFee",
      chain: walletClient.chain ?? null,
      account,
      args: [params.assetId, [...params.subscribers]],
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

  async getAssetSubscriptionDuration(params: { assetAddress: Address }): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "getSubscriptionDuration",
      args: [],
    })) as bigint;
  }

  async getAssetSubscriptionPrice(params: { assetAddress: Address; count: bigint }): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "getSubscriptionPrice",
      args: [params.count],
    })) as bigint;
  }

  async getAssetSubscriptionPriceAndDuration(params: {
    assetAddress: Address;
    count: bigint;
  }): Promise<{ price: bigint; duration: bigint }> {
    const [price, duration] = (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "getSubscriptionPriceAndDuration",
      args: [params.count],
    })) as [bigint, bigint];
    return { price, duration };
  }

  async getAssetSubscription(params: {
    assetAddress: Address;
    subscriberId: string;
    subscriberAddress: Address;
  }): Promise<bigint> {
    const sub = subscriberHash(params.subscriberId, params.subscriberAddress);
    return (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "getSubscription",
      args: [sub],
    })) as bigint;
  }

  async getAssetSubscriptionStatus(params: {
    assetAddress: Address;
    subscriberId: string;
    user: Address;
    source?: "auto" | "onchain" | "indexer";
  }): Promise<SubscriptionStatus> {
    const source = params.source ?? "auto";

    if (source === "indexer" || (source === "auto" && this.indexerUrl)) {
      if (!this.indexerUrl || !this.indexer) throw new Error("indexerUrl is not configured");
      try {
        const fromIndexer = await this.getSubscriptionFromIndexerByAssetAddress({
          assetAddress: params.assetAddress,
          subscriberId: params.subscriberId,
          user: params.user,
        });
        if (fromIndexer) return fromIndexer;
      } catch {
        if (source === "indexer") throw new Error("Indexer request failed");
      }
    }

    const [isActive, endTime] = await Promise.all([
      this.isAssetSubscriptionActive({
        assetAddress: params.assetAddress,
        subscriberId: params.subscriberId,
        subscriberAddress: params.user,
      }),
      this.getAssetSubscription({
        assetAddress: params.assetAddress,
        subscriberId: params.subscriberId,
        subscriberAddress: params.user,
      }),
    ]);
    return { isActive, endTime };
  }

  async isAssetSubscriptionActive(params: {
    assetAddress: Address;
    subscriberId: string;
    subscriberAddress: Address;
  }): Promise<boolean> {
    const sub = subscriberHash(params.subscriberId, params.subscriberAddress);
    return (await this.publicClient.readContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "isSubscriptionActive",
      args: [sub],
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
    subscriberId: string;
    subscriberAddress: Address;
    payer: Address;
    spender: Address;
    count: bigint;
    deadline: bigint;
    v: number;
    r: Hex;
    s: Hex;
  }) {
    const { walletClient, account } = this.getWalletContext();
    const sub = subscriberHash(params.subscriberId, params.subscriberAddress);
    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "subscribe",
      chain: walletClient.chain ?? null,
      account,
      args: [sub, params.payer, params.spender, params.count, params.deadline, params.v, params.r, params.s],
    });
  }

  async claimCreatorFee(params: ClaimCreatorFeeParams) {
    const { walletClient, account } = this.getWalletContext();
    const sub = subscriberHash(params.subscriberId, params.subscriberAddress);
    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "claimCreatorFee",
      chain: walletClient.chain ?? null,
      account,
      args: [sub],
    });
  }

  async claimCreatorFeeBatch(params: { assetAddress: Address; subscribers: readonly Hex[] }) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "claimCreatorFee",
      chain: walletClient.chain ?? null,
      account,
      args: [params.subscribers as unknown as Hex[]],
    });
  }

  async claimRegistryFeeOnAsset(params: ManageSubscriptionParams) {
    const { walletClient, account } = this.getWalletContext();
    const sub = subscriberHash(params.subscriberId, params.subscriberAddress);
    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "claimRegistryFee",
      chain: walletClient.chain ?? null,
      account,
      args: [sub],
    });
  }

  async revokeSubscription(params: ManageSubscriptionParams) {
    const { walletClient, account } = this.getWalletContext();
    const sub = subscriberHash(params.subscriberId, params.subscriberAddress);
    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "revokeSubscription",
      chain: walletClient.chain ?? null,
      account,
      args: [sub],
    });
  }

  async cancelSubscription(params: CancelSubscriptionParams) {
    const { walletClient, account } = this.getWalletContext();
    return walletClient.writeContract({
      address: params.assetAddress,
      abi: AssetABI,
      functionName: "cancelSubscription",
      chain: walletClient.chain ?? null,
      account,
      args: [params.subscriberId, params.signature],
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
