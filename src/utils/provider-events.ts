import type { EIP1193EventMap } from "viem";

export type ProviderEventMap = EIP1193EventMap;
export type ProviderEventName = keyof ProviderEventMap;

export const PROVIDER_EVENTS = [
  "accountsChanged",
  "chainChanged",
  "connect",
  "disconnect",
  "message",
] as const satisfies ProviderEventName[];

export function isProviderEvent(value: string): value is ProviderEventName {
  return (PROVIDER_EVENTS as readonly string[]).includes(value);
}
