export const RPC_STORAGE_KEY_PREFIX = "splits:rpc:";
export const RPC_STORAGE_MESSAGE_TYPE = "splits-connect:getStoredRpcPayload";
export const RPC_STORAGE_TTL_MS = 5 * 60 * 1000; // 5 minutes.–
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

export function encodeRpcDataPlaceholder(extensionId: string, token: string) {
  return `${RPC_DATA_PLACEHOLDER_PREFIX}${extensionId}:${token}`;
}

export function decodeRpcDataPlaceholder(value: string) {
  if (!value.startsWith(RPC_DATA_PLACEHOLDER_PREFIX)) return null;
  const remainder = value.slice(RPC_DATA_PLACEHOLDER_PREFIX.length);
  const [extensionId, token] = remainder.split(":");
  if (!extensionId || !token) return null;
  return { extensionId, token };
}
