export const AssetRegistryABI = [
  {
    type: "function",
    name: "getAsset",
    inputs: [{ name: "_assetId", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isSubscriptionActive",
    inputs: [
      { name: "_assetId", type: "bytes32" },
      { name: "_user", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSubscription",
    inputs: [
      { name: "_assetId", type: "bytes32" },
      { name: "_user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "subscribe",
    inputs: [
      { name: "_assetId", type: "bytes32" },
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" },
      { name: "_deadline", type: "uint256" },
      { name: "_v", type: "uint8" },
      { name: "_r", type: "bytes32" },
      { name: "_s", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

