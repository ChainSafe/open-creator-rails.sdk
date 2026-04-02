import { encodePacked, keccak256 } from "viem";
import type { Address, Hex } from "viem";

/** `bytes32` subscriber identity hash derived from the subscriber address (matches on-chain encoding). */
export function subscriberToId(subscriber: Address): Hex {
  return keccak256(encodePacked(["address"], [subscriber]));
}

export function asAddress(value: unknown): Address {
  if (typeof value !== "string") throw new Error("Expected address string");
  return value as Address;
}

export function asHex(value: unknown): Hex {
  if (typeof value !== "string") throw new Error("Expected hex string");
  return value as Hex;
}

type GraphQlResponse<T> =
  | { data: T; errors?: unknown }
  | { data?: T; errors: Array<{ message?: string }> };

export async function graphql<TData>(
  indexerUrl: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<TData> {
  const response = await fetch(indexerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Indexer request failed with status ${response.status}`);
  }

  const json = (await response.json()) as GraphQlResponse<TData>;
  const errors = (json as any)?.errors as unknown;
  if (Array.isArray(errors) && errors.length) {
    const msg = errors
      .map((e: any) => (typeof e?.message === "string" ? e.message : null))
      .filter(Boolean)
      .join("; ");
    throw new Error(msg ? `Indexer GraphQL error: ${msg}` : "Indexer GraphQL error");
  }
  if (!("data" in json) || json.data == null) {
    throw new Error("Indexer response missing data");
  }
  return json.data;
}
