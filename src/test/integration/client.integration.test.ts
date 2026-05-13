import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { execFile } from "node:child_process";

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  parseAbi,
} from "viem";
import { signTypedData, privateKeyToAccount } from "viem/accounts";

import { OcrSdk } from "../../client";
import { AssetRegistryABI } from "../../config/AssetRegistryABI";
import { subscriberHash } from "../../utils";

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "1";
const describeIntegration = runIntegration ? describe : describe.skip;

const TEST_CHAIN_ID = 31337;

const testTokenAbi = parseAbi([
  "function name() view returns (string)",
  "function nonces(address owner) view returns (uint256)",
  "function mint(address to,uint256 amount)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function balanceOf(address owner) view returns (uint256)",
]);

const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const INTEGRATION_SUBSCRIBER_ID = "integration_subscriber";

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      if (!port) reject(new Error("Unable to allocate port"));
      else resolve(port);
      server.close();
    });
  });
}

function parseAnvilOutput(output: string) {
  const accountsSection = output.split("Available Accounts")[1]?.split("Private Keys")[0] ?? "";
  const keysSection = output.split("Private Keys")[1]?.split("Wallet")[0] ?? "";

  const accountMatches = [...accountsSection.matchAll(/\((\d+)\)\s(0x[a-fA-F0-9]{40})/g)];
  const keyMatches = [...keysSection.matchAll(/\((\d+)\)\s(0x[a-fA-F0-9]{64})/g)];

  const byIndex = new Map<number, { address: `0x${string}`; privateKey: `0x${string}` }>();

  for (const m of accountMatches) {
    const idx = Number(m[1]);
    const address = m[2] as `0x${string}`;
    const existing = byIndex.get(idx);
    byIndex.set(idx, { address, privateKey: existing?.privateKey ?? ("0x" + "0".repeat(64)) as `0x${string}` });
  }

  for (const m of keyMatches) {
    const idx = Number(m[1]);
    const privateKey = m[2] as `0x${string}`;
    const existing = byIndex.get(idx);
    byIndex.set(idx, { address: existing?.address ?? ("0x" + "0".repeat(40)) as `0x${string}`, privateKey });
  }

  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);
}

async function startAnvil() {
  const port = await getFreePort();
  const proc = spawn(
    "anvil",
    ["--chain-id", String(TEST_CHAIN_ID), "--port", String(port), "--accounts", "3", "--host", "127.0.0.1"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let output = "";
  proc.stdout?.on("data", (d) => {
    output += d.toString();
    if (output.includes(`Listening on 127.0.0.1:${port}`)) {
      // no-op: handled by waiter below
    }
  });
  proc.stderr?.on("data", (d) => {
    output += d.toString();
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out starting anvil")), 20_000);
    const interval = setInterval(() => {
      if (output.includes(`Listening on 127.0.0.1:${port}`)) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve();
      }
    }, 50);

    proc.on("error", (err) => {
      clearTimeout(timeout);
      clearInterval(interval);
      reject(err);
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      clearInterval(interval);
      reject(new Error(`Anvil exited early with code ${code}`));
    });
  });

  const accounts = parseAnvilOutput(output);
  if (accounts.length < 3) {
    throw new Error(`Expected at least 3 anvil accounts, got ${accounts.length}`);
  }

  const rpcUrl = `http://127.0.0.1:${port}`;
  return { proc, rpcUrl, accounts };
}

async function execForgeCreate({
  rpcUrl,
  privateKey,
  contractRef,
  constructorArgs,
}: {
  rpcUrl: string;
  privateKey: `0x${string}`;
  contractRef: string;
  constructorArgs: Array<string>;
}): Promise<`0x${string}`> {
  const contractsDir = path.join(process.cwd(), "open-creator-rails");
  const args = [
    "create",
    contractRef,
    "--broadcast",
    "--rpc-url",
    rpcUrl,
    "--private-key",
    privateKey,
  ];
  if (constructorArgs.length > 0) {
    args.push("--constructor-args", ...constructorArgs);
  }

  const exec = (): Promise<{ stdout: string; stderr: string }> =>
    new Promise((resolve, reject) => {
      execFile("forge", args, { cwd: contractsDir, env: process.env }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      });
    });

  const { stdout, stderr } = await exec();
  const combined = `${stdout}\n${stderr}`;
  const m = combined.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
  if (!m) throw new Error(`Unable to parse deployed address from forge output: ${combined}`);
  return m[1] as `0x${string}`;
}

function splitSignature(sig: `0x${string}`) {
  const clean = sig.slice(2);
  const r = (`0x${clean.slice(0, 64)}`) as `0x${string}`;
  const s = (`0x${clean.slice(64, 128)}`) as `0x${string}`;
  let v = parseInt(clean.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}

describeIntegration("OcrSdk integration (anvil + real contracts)", () => {
  let anvil: Awaited<ReturnType<typeof startAnvil>> | null = null;

  let publicClient!: ReturnType<typeof createPublicClient>;
  let registryAddress: `0x${string}`;
  let tokenAddress: `0x${string}`;
  let assetAddress: `0x${string}`;

  let payer: { address: `0x${string}`; privateKey: `0x${string}` };
  let registryOwner: { address: `0x${string}`; privateKey: `0x${string}` };
  let assetOwner: { address: `0x${string}`; privateKey: `0x${string}` };

  const subscriptionPrice = 100000000n;
  const subscriptionDurationSeconds = 60n;
  const ASSET_ID = keccak256(stringToHex("asset_id"));

  const mintAmount = 10_000_000_000n * 10n ** 6n;

  beforeAll(async () => {
    anvil = await startAnvil();

    const chain = {
      id: TEST_CHAIN_ID,
      name: "anvil",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [anvil.rpcUrl] } },
    } as any;

    publicClient = createPublicClient({ chain, transport: http(anvil.rpcUrl) }) as any;

    payer = anvil.accounts[0]!;
    registryOwner = anvil.accounts[1]!;
    assetOwner = anvil.accounts[2]!;

    tokenAddress = await execForgeCreate({
      rpcUrl: anvil.rpcUrl,
      privateKey: payer.privateKey,
      contractRef: "src/TestToken.sol:TestToken",
      constructorArgs: [],
    });

    registryAddress = await execForgeCreate({
      rpcUrl: anvil.rpcUrl,
      privateKey: registryOwner.privateKey,
      contractRef: "src/AssetRegistry.sol:AssetRegistry",
      constructorArgs: ["30"],
    });

    const walletPayer = createWalletClient({
      chain,
      transport: http(anvil.rpcUrl),
      account: privateKeyToAccount(payer.privateKey),
    }) as any;

    const mintTx = await walletPayer.writeContract({
      address: tokenAddress,
      abi: testTokenAbi,
      functionName: "mint",
      args: [payer.address, mintAmount],
    } as any);
    await publicClient.waitForTransactionReceipt({ hash: mintTx });

    const walletRegistryOwner = createWalletClient({
      chain,
      transport: http(anvil.rpcUrl),
      account: privateKeyToAccount(registryOwner.privateKey),
    }) as any;

    const createTx = await walletRegistryOwner.writeContract({
      address: registryAddress,
      abi: AssetRegistryABI,
      functionName: "createAsset",
      args: [ASSET_ID, subscriptionPrice, subscriptionDurationSeconds, tokenAddress, assetOwner.address],
    } as any);
    await publicClient.waitForTransactionReceipt({ hash: createTx });

    assetAddress = (await publicClient.readContract({
      address: registryAddress,
      abi: AssetRegistryABI,
      functionName: "getAsset",
      args: [ASSET_ID],
    })) as `0x${string}`;
  }, 60_000);

  afterAll(async () => {
    if (anvil?.proc) {
      anvil.proc.kill("SIGTERM");
    }
  });

  it("subscribes and reads subscription status onchain", async () => {
    if (!anvil) throw new Error("Integration environment not initialized");

    const chain = {
      id: TEST_CHAIN_ID,
      name: "anvil",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [anvil.rpcUrl] } },
    } as any;

    const walletPayer = createWalletClient({
      chain,
      transport: http(anvil.rpcUrl),
      account: privateKeyToAccount(payer.privateKey),
    }) as any;

    const sdk = new OcrSdk({
      publicClient: publicClient as any,
      walletClient: walletPayer as any,
      registryAddress,
    } as any);

    const latest = await publicClient.getBlock({ blockTag: "latest" });
    const startTime = latest.timestamp;

    const count = 1n;
    const value = subscriptionPrice * count;
    const deadline = startTime + subscriptionDurationSeconds;

    const nonce = (await publicClient.readContract({
      address: tokenAddress,
      abi: testTokenAbi,
      functionName: "nonces",
      args: [payer.address],
    })) as bigint;

    const tokenName = (await publicClient.readContract({
      address: tokenAddress,
      abi: testTokenAbi,
      functionName: "name",
    })) as string;

    const chainId = await publicClient.getChainId();

    const signature = await signTypedData({
      privateKey: payer.privateKey,
      domain: {
        name: tokenName,
        version: "1",
        chainId,
        verifyingContract: tokenAddress,
      },
      types: permitTypes as any,
      primaryType: "Permit",
      message: {
        owner: payer.address,
        spender: assetAddress,
        value,
        nonce,
        deadline,
      } as any,
    });

    const { v, r, s } = splitSignature(signature as `0x${string}`);

    await (sdk.subscribe({
      assetId: ASSET_ID,
      subscriberId: INTEGRATION_SUBSCRIBER_ID,
      subscriberAddress: payer.address,
      payer: payer.address,
      count,
      deadline,
      v,
      r,
      s,
    }) as any);

    const status = await sdk.getSubscriptionStatus({
      assetId: ASSET_ID,
      subscriberId: INTEGRATION_SUBSCRIBER_ID,
      user: payer.address,
      source: "onchain",
    });

    const after = await publicClient.getBlock({ blockTag: "latest" });
    expect(status.isActive).toBe(true);
    expect(status.endTime).toBeDefined();
    expect((status.endTime as bigint) > after.timestamp).toBe(true);
  }, 60_000);

  it("allows asset owner to claim creator fees after expiry", async () => {
    if (!anvil) throw new Error("Integration environment not initialized");

    const chain = {
      id: TEST_CHAIN_ID,
      name: "anvil",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [anvil.rpcUrl] } },
    } as any;

    const tokenAbiWithBalance = testTokenAbi;
    const beforeBalance = (await publicClient.readContract({
      address: tokenAddress,
      abi: tokenAbiWithBalance,
      functionName: "balanceOf",
      args: [assetOwner.address],
    })) as bigint;

    await publicClient.request({ method: "evm_increaseTime", params: [Number(subscriptionDurationSeconds + 5n)] } as any);
    await publicClient.request({ method: "evm_mine", params: [] } as any);

    const walletAssetOwner = createWalletClient({
      chain,
      transport: http(anvil.rpcUrl),
      account: privateKeyToAccount(assetOwner.privateKey),
    }) as any;

    const sdkOwner = new OcrSdk({
      publicClient: publicClient as any,
      walletClient: walletAssetOwner as any,
      registryAddress,
    } as any);

    const expectedSubscriberHash = subscriberHash(INTEGRATION_SUBSCRIBER_ID, payer.address);
    expect(expectedSubscriberHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    await sdkOwner.claimCreatorFee({
      assetAddress,
      subscriberId: INTEGRATION_SUBSCRIBER_ID,
      subscriberAddress: payer.address,
    });

    const afterBalance = (await publicClient.readContract({
      address: tokenAddress,
      abi: tokenAbiWithBalance,
      functionName: "balanceOf",
      args: [assetOwner.address],
    })) as bigint;

    expect(afterBalance).toBeGreaterThan(beforeBalance);
  }, 60_000);

  it("supports AssetRegistry namespaced reads/writes", async () => {
    if (!anvil) throw new Error("Integration environment not initialized");

    const chain = {
      id: TEST_CHAIN_ID,
      name: "anvil",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [anvil.rpcUrl] } },
    } as any;

    const walletRegistryOwner = createWalletClient({
      chain,
      transport: http(anvil.rpcUrl),
      account: privateKeyToAccount(registryOwner.privateKey),
    }) as any;

    const sdkRegistryOwner = new OcrSdk({
      publicClient: publicClient as any,
      walletClient: walletRegistryOwner as any,
      registryAddress,
    } as any);

    const exists = await sdkRegistryOwner.AssetRegistry.viewAsset({ assetId: ASSET_ID });
    expect(exists).toBe(true);

    const assetFromRegistry = await sdkRegistryOwner.AssetRegistry.getAsset({ assetId: ASSET_ID });
    expect(assetFromRegistry.toLowerCase()).toBe(assetAddress.toLowerCase());

    const beforeShares = await sdkRegistryOwner.AssetRegistry.getFeeShares();
    expect(beforeShares.totalFeeShare).toBe(100n);
    expect(beforeShares.creatorFeeShare).toBe(70n);
    expect(beforeShares.registryFeeShare).toBe(30n);

    await sdkRegistryOwner.AssetRegistry.updateRegistryFeeShare({ registryFeeShare: 40n });

    const afterShares = await sdkRegistryOwner.AssetRegistry.getFeeShares();
    expect(afterShares.totalFeeShare).toBe(100n);
    expect(afterShares.creatorFeeShare).toBe(60n);
    expect(afterShares.registryFeeShare).toBe(40n);

    await sdkRegistryOwner.AssetRegistry.updateRegistryFeeShare({ registryFeeShare: 30n });
  }, 60_000);

  it("supports Asset namespaced reads/writes", async () => {
    if (!anvil) throw new Error("Integration environment not initialized");

    const chain = {
      id: TEST_CHAIN_ID,
      name: "anvil",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [anvil.rpcUrl] } },
    } as any;

    const walletAssetOwner = createWalletClient({
      chain,
      transport: http(anvil.rpcUrl),
      account: privateKeyToAccount(assetOwner.privateKey),
    }) as any;

    const sdkAssetOwner = new OcrSdk({
      publicClient: publicClient as any,
      walletClient: walletAssetOwner as any,
      registryAddress,
    } as any);

    const assetOwnerOnchain = await sdkAssetOwner.Asset.owner({ assetAddress });
    expect(assetOwnerOnchain.toLowerCase()).toBe(assetOwner.address.toLowerCase());

    const tokenOnAsset = await sdkAssetOwner.Asset.getTokenAddress({ assetAddress });
    expect(tokenOnAsset.toLowerCase()).toBe(tokenAddress.toLowerCase());

    const registryOnAsset = await sdkAssetOwner.Asset.getRegistryAddress({ assetAddress });
    expect(registryOnAsset.toLowerCase()).toBe(registryAddress.toLowerCase());

    const durationOnAsset = await sdkAssetOwner.Asset.getSubscriptionDuration({ assetAddress });
    expect(durationOnAsset).toBe(subscriptionDurationSeconds);

    const subscriptionPriceForOnePeriod = await sdkAssetOwner.Asset.getSubscriptionPrice({
      assetAddress,
      count: 1n,
    });
    expect(subscriptionPriceForOnePeriod).toBe(subscriptionPrice);

    const beforePriceForTwoPeriods = await sdkAssetOwner.Asset.getSubscriptionPrice({
      assetAddress,
      count: 2n,
    });

    await sdkAssetOwner.Asset.setSubscriptionPrice({
      assetAddress,
      newSubscriptionPrice: subscriptionPrice + 1n,
    });

    const afterPriceForTwoPeriods = await sdkAssetOwner.Asset.getSubscriptionPrice({
      assetAddress,
      count: 2n,
    });
    expect(afterPriceForTwoPeriods).toBe(beforePriceForTwoPeriods + 2n);

    await sdkAssetOwner.Asset.setSubscriptionPrice({
      assetAddress,
      newSubscriptionPrice: subscriptionPrice,
    });

    const payerSubscriptionEnd = await sdkAssetOwner.Asset.getSubscription({
      assetAddress,
      subscriberId: INTEGRATION_SUBSCRIBER_ID,
      subscriberAddress: payer.address,
    });
    expect(payerSubscriptionEnd).toBeGreaterThan(0n);

    const payerActive = await sdkAssetOwner.Asset.isSubscriptionActive({
      assetAddress,
      subscriberId: INTEGRATION_SUBSCRIBER_ID,
      subscriberAddress: payer.address,
    });
    expect(typeof payerActive).toBe("boolean");
  }, 60_000);
});
