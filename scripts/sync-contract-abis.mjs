#!/usr/bin/env node
/**
 * Build OCR contracts in the submodule (forge) and refresh `src/config/*ABI.ts`
 * from `open-creator-rails/out/*.json` (Foundry `out` for the submodule root).
 *
 * Usage:
 *   node scripts/sync-contract-abis.mjs           # forge build + write files
 *   node scripts/sync-contract-abis.mjs --check # forge build + fail if repo differs
 *
 * Optional: SKIP_FORGE=1 to only read existing `out/` (local dev; CI should not skip).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");
const skipForge = process.env.SKIP_FORGE === "1";

/** Foundry project root (`foundry.toml`); artifacts live under `<this>/out/`. */
const contractsDir = path.join(root, "open-creator-rails");

const targets = [
  {
    exportName: "AssetABI",
    jsonRel: path.join("out", "Asset.sol", "Asset.json"),
    outRel: path.join("src", "config", "AssetABI.ts"),
  },
  {
    exportName: "AssetRegistryABI",
    jsonRel: path.join("out", "AssetRegistry.sol", "AssetRegistry.json"),
    outRel: path.join("src", "config", "AssetRegistryABI.ts"),
  },
];

function renderModule(exportName, jsonRelFromContracts, abi) {
  const posix = jsonRelFromContracts.split(path.sep).join("/");
  const note = `open-creator-rails/apps/contracts/${posix}`;
  return `import type { Abi } from "viem";

/** Generated from \`${note}\`. Regenerate with \`npm run abis:sync\`. */
export const ${exportName} = ${JSON.stringify(abi, null, 2)} as const satisfies Abi;
`;
}

function normalizeEol(s) {
  return s.replace(/\r\n/g, "\n");
}

if (!fs.existsSync(path.join(root, "open-creator-rails", ".git"))) {
  console.error("Submodule open-creator-rails is missing. Run: git submodule update --init --recursive");
  process.exit(1);
}

if (!skipForge) {
  const r = spawnSync("forge", ["build"], { cwd: contractsDir, stdio: "inherit", env: process.env });
  if (r.error) {
    console.error(r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
} else {
  console.warn("SKIP_FORGE=1: using existing forge artifacts under apps/contracts/out/");
}

let exitCode = 0;
for (const t of targets) {
  const jsonPath = path.join(contractsDir, t.jsonRel);
  if (!fs.existsSync(jsonPath)) {
    console.error(`Missing artifact: ${path.relative(root, jsonPath)}`);
    console.error("Run forge build from open-creator-rails (or omit SKIP_FORGE=1).");
    process.exit(1);
  }
  const { abi } = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const content = normalizeEol(renderModule(t.exportName, t.jsonRel, abi));
  const outPath = path.join(root, t.outRel);

  if (checkOnly) {
    if (!fs.existsSync(outPath)) {
      console.error(`Missing ${t.outRel}; run npm run abis:sync`);
      exitCode = 1;
      continue;
    }
    const existing = normalizeEol(fs.readFileSync(outPath, "utf8"));
    if (existing !== content) {
      console.error(`ABI drift: ${t.outRel} does not match forge output.`);
      console.error(`  Artifact: ${path.relative(root, jsonPath)}`);
      exitCode = 1;
    }
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content, "utf8");
    console.log("Wrote", path.relative(root, outPath));
  }
}

if (exitCode !== 0 && checkOnly) {
  console.error("\nRun `npm run abis:sync` after updating the open-creator-rails submodule or contracts, then commit.");
}

process.exit(exitCode);
