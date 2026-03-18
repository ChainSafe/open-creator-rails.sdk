export const AssetABI = [
  {
    type: "function",
    name: "claimCreatorFee",
    inputs: [{ name: "subscriber", type: "address" }],
    outputs: [{ name: "creatorFee", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeSubscription",
    inputs: [{ name: "subscriber", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancelSubscription",
    inputs: [{ name: "subscriber", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

