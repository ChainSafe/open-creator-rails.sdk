# Open Creator Rails SDK

TypeScript SDK for interacting with Open Creator Rails contracts and (optionally) the Ponder indexer.

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



