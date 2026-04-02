# Open Creator Rails SDK

TypeScript SDK for interacting with Open Creator Rails

## Install

```bash
pnpm add @open-creator-rails/sdk viem
```

## Quick start

```ts
import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { OcrSdk } from "@open-creator-rails/sdk";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.RPC_URL!),
});

const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(process.env.RPC_URL!),
  account: /* your account */,
});

const sdk = new OcrSdk({
  publicClient,
  walletClient,
  registryAddress,
  indexerUrl: process.env.INDEXER_URL, // optional
});
```

## API overview

The SDK exposes:

- **Namespaced contract APIs** 
  - `sdk.AssetRegistry.*` wraps `AssetRegistry` contract methods
  - `sdk.Asset.*` wraps `Asset` contract methods
- **Bound "Asset client" helper**
  - `sdk.getAsset({ assetAddress })` and `sdk.getAssetById({ assetId })` return an object that remembers `assetAddress`.
- **Indexer namespace**
  - `sdk.indexer.*` exposes indexer-only queries that are not possible with simple onchain reads.

### Namespaced contract usage

```ts
// AssetRegistry reads
const assetAddress = await sdk.AssetRegistry.getAsset({ assetId });
const exists = await sdk.AssetRegistry.viewAsset({ assetId });

// Asset reads (namespace form)
const owner = await sdk.Asset.owner({ assetAddress });
const token = await sdk.Asset.getTokenAddress({ assetAddress });

// Asset reads (bound client form)
const asset = sdk.getAsset({ assetAddress }); // or: await sdk.getAssetById({ assetId })
await asset.setSubscriptionPrice({ newSubscriptionPrice: 123n });
```

### Write methods (require `walletClient`)

All write methods require `walletClient` in the SDK config and `walletClient.account` to be set.

```ts
await sdk.AssetRegistry.updateCreatorFeeShare({ creatorFeeShare: 60n });
await sdk.Asset.setSubscriptionPrice({ assetAddress, newSubscriptionPrice: 123n });

// Or with the bound asset client:
await asset.setSubscriptionPrice({ newSubscriptionPrice: 123n });
```

## Indexer support

If you pass `indexerUrl`, the SDK exposes a dedicated indexer namespace at `sdk.indexer`.

### Indexer namespace (`sdk.indexer`)

```ts
if (!sdk.indexer) throw new Error("indexerUrl not configured");

// Subscription for a specific asset + user
const sub = await sdk.indexer.getSubscription({ assetAddress, user });

// All subscriptions for a user (across assets), optionally only active ones
const activeSubs = await sdk.indexer.listSubscriptionsByUser({ user, activeOnly: true });

// Asset metadata (indexed)
const assetEntity = await sdk.indexer.getAsset({ assetAddress });

// Assets indexed for a registry
const assetsInRegistry = await sdk.indexer.listAssetsByRegistry({ registryAddress });
```

### Source selection

Some methods accept `source?: "auto" | "onchain" | "indexer"`:

- **`"auto"`** (default): try indexer (if configured), then fall back to onchain
- **`"onchain"`**: only onchain reads
- **`"indexer"`**: only indexer; throws if the indexer request fails

### Indexer-backed reads

These methods are implemented with indexer-first + fallback behavior:

```ts
// Subscription status by assetId + user
const status = await sdk.getSubscriptionStatus({ assetId, user, source: "auto" });

// Subscription status by assetAddress + user
const status2 = await sdk.Asset.getSubscriptionStatus({ assetAddress, user, source: "auto" });

// Asset owner by assetAddress
const owner2 = await sdk.Asset.getOwner({ assetAddress, source: "auto" });
```

## Local Node (Anvil) + SDK Testing

This SDK can be tested end-to-end against a local Anvil chain using the contracts from the `open-creator-rails` submodule.

### Prerequisites
1. Install Foundry (provides `anvil` + `forge`).
2. Initialize the contracts submodule:
```bash
git submodule update --init --recursive
```

### Run integration tests (recommended)
These tests start Anvil, deploy `TestToken` and `AssetRegistry`, run `subscribe`/`getSubscriptionStatus`, advance time, and then run `claimCreatorFee`.

```bash
npm run test:integration
```

### Manual debugging (optional)
Start Anvil on the default port:
```bash
anvil --chain-id 31337 --port 8545
```

Then point your SDK clients at it (as shown in the `Usage` section above) by setting:
```bash
export RPC_URL=http://127.0.0.1:8545
```

## Maintenance

### Updating the `open-creator-rails` submodule
This repo includes `open-creator-rails` as a git submodule (used for contract ABIs + deployment JSON). When upstream `main` changes, update the submodule and commit the new submodule SHA (the gitlink) in this repo.

#### Recommended update workflow
1. Ensure submodules are initialized:
```bash
git submodule update --init --recursive
```

2. Update the submodule to the newest remote commit:
```bash
git submodule update --remote --merge open-creator-rails
```

3. Commit the updated gitlink SHA in this repository:
```bash
git status
git add open-creator-rails
git commit -m "chore: update open-creator-rails submodule"
```



