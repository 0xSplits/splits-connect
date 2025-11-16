import type { BridgeRequestMessage } from "@/utils/bridge";
import {
  LARGE_RPC_METHODS,
  cleanupExpiredRpcEntries,
  encodeRpcDataPlaceholder,
  storeRpcPayload,
} from "./rpc-storage";
import { isHex } from "viem";

type RpcPayload = BridgeRequestMessage["payload"];

export async function maybeOffloadLargeRpc(
  extensionId: string,
  payload: RpcPayload
): Promise<RpcPayload> {
  try {
    if (!LARGE_RPC_METHODS.has(payload.method)) return payload;
    if (payload.params === undefined) return payload;

    const { value: normalizedParams, mutated } = await maybeOffloadRpcValue(
      extensionId,
      payload.method,
      payload.params
    );
    if (!mutated) return payload;
    return {
      ...payload,
      params: normalizedParams as RpcPayload["params"],
    };
  } catch {
    return payload;
  }
}

async function maybeOffloadRpcValue(
  extensionId: string,
  method: string,
  value: unknown
): Promise<{ value: unknown; mutated: boolean }> {
  await cleanupExpiredRpcEntries();

  if (method === "eth_sendTransaction") {
    if (!Array.isArray(value)) return { value, mutated: false };

    const params = value[0] as Record<string, unknown>;
    const data = typeof params?.data === "string" ? params.data : "";

    if (!isHex(data) || data === "0x") return { value, mutated: false };

    const token = await storeRpcPayload(data);
    params.data = encodeRpcDataPlaceholder(extensionId, token);

    return { value: [params], mutated: true };
  }

  if (method === "wallet_sendCalls") {
    if (!Array.isArray(value)) return { value, mutated: false };

    const params = value[0] as Record<string, unknown>;

    const calls = params.calls as
      | { to: string; value: string; data: string }[]
      | undefined;

    if (!Array.isArray(calls) || calls.length === 0)
      return { value, mutated: false };

    const firstCall = calls[0];
    if (
      !firstCall ||
      typeof firstCall.data !== "string" ||
      !isHex(firstCall.data) ||
      firstCall.data === "0x"
    ) {
      return { value, mutated: false };
    }

    const payload = JSON.stringify({ calls });

    if (payload.length === 0) return { value, mutated: false };

    const token = await storeRpcPayload(payload);
    params.calls = [
      {
        data: encodeRpcDataPlaceholder(extensionId, token),
        to: calls[0].to,
        value: calls[0].value,
      },
    ];

    return { value: [params], mutated: true };
  }

  return { value, mutated: false };
}
