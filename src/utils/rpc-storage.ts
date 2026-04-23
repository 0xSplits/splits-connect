import { sha256, stringToBytes } from "viem";

export const RPC_STORAGE_KEY_PREFIX = "splits:rpc:";
export const RPC_STORAGE_MESSAGE_TYPE = "splits-connect:getStoredRpcPayload";
export const RPC_STORAGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const RPC_DATA_PLACEHOLDER_PREFIX = "0xsplitsconnectkey:";

export type RpcStorageEntry = {
  value: string;
  createdAt: number;
};

export const LARGE_RPC_METHODS = new Set([
  "eth_sendTransaction",
  "wallet_sendCalls",
]);

export function createRpcToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createRpcStorageKey(token: string) {
  return `${RPC_STORAGE_KEY_PREFIX}${token}`;
}

export function encodeRpcDataPlaceholder(
  extensionId: string,
  token: string,
  hash: string
) {
  return `${RPC_DATA_PLACEHOLDER_PREFIX}${extensionId}:${token}:${hash}`;
}

export function decodeRpcDataPlaceholder(value: string) {
  if (!value.startsWith(RPC_DATA_PLACEHOLDER_PREFIX)) return null;
  const remainder = value.slice(RPC_DATA_PLACEHOLDER_PREFIX.length);
  const [extensionId, token, hash] = remainder.split(":");
  if (!extensionId || !token || !hash) return null;
  return { extensionId, token, hash };
}

export function canonicalSendTxPayload(input: {
  to: string;
  value: string;
  data: string;
}) {
  return JSON.stringify({ to: input.to, value: input.value, data: input.data });
}

export function sha256Hex(input: string) {
  return sha256(stringToBytes(input));
}

export async function storeRpcPayload(serialized: string) {
  const token = createRpcToken();
  const entry: RpcStorageEntry = {
    createdAt: Date.now(),
    value: serialized,
  };
  await browser.storage.local.set({
    [createRpcStorageKey(token)]: entry,
  });
  return token;
}

export async function consumeRpcPayload(token: string) {
  const storageKey = createRpcStorageKey(token);
  const stored = (await browser.storage.local.get(storageKey)) as Record<
    string,
    RpcStorageEntry | undefined
  >;
  const entry = stored[storageKey];
  await browser.storage.local.remove(storageKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > RPC_STORAGE_TTL_MS) return null;
  return entry.value;
}

export async function cleanupExpiredRpcEntries(now = Date.now()) {
  const allEntries = await browser.storage.local.get(null);
  const expiredKeys: string[] = [];
  for (const [key, value] of Object.entries(allEntries)) {
    if (!key.startsWith(RPC_STORAGE_KEY_PREFIX)) continue;
    const entry = value as RpcStorageEntry | undefined;
    if (!entry) continue;
    if (now - entry.createdAt > RPC_STORAGE_TTL_MS) expiredKeys.push(key);
  }
  if (expiredKeys.length > 0) await browser.storage.local.remove(expiredKeys);
}
