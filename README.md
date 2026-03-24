# Open Creator Rails SDK

TypeScript SDK for interacting with Open Creator Rails

## Install

```bash
pnpm add @open-creator-rails/sdk viem
```

## Usage

```ts
import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { createOcrSdk, sepoliaDeployments } from "@open-creator-rails/sdk";

const registryAddress = sepoliaDeployments[0].address as `0x${string}`;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.RPC_URL!),
});

const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(process.env.RPC_URL!),
  account: /* your account */,
});

const sdk = createOcrSdk({
  publicClient,
  walletClient,
  registryAddress,
  indexerUrl: process.env.INDEXER_URL, // optional
});
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



