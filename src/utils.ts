import { encodePacked, keccak256 } from "viem";
import type { Address, Hex } from "viem";

/** `bytes32` subscriber identity hash derived from the subscriber address (matches on-chain encoding). */
export function subscriberToId(subscriber: Address): Hex {
  return keccak256(encodePacked(["address"], [subscriber]));
}
