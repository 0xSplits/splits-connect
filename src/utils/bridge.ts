const BRIDGE_NAMESPACE = "splits-connect:porto";

export const MESSAGE_SOURCE_INPAGE = `${BRIDGE_NAMESPACE}:inpage`;
export const MESSAGE_SOURCE_CONTENT = `${BRIDGE_NAMESPACE}:content`;
export const MESSAGE_TYPE_REQUEST = `${BRIDGE_NAMESPACE}:request`;
export const MESSAGE_TYPE_RESPONSE = `${BRIDGE_NAMESPACE}:response`;
export const MESSAGE_TYPE_EVENT = `${BRIDGE_NAMESPACE}:event`;
export const MESSAGE_TYPE_READY = `${BRIDGE_NAMESPACE}:ready`;
export const MESSAGE_TYPE_READY_REQUEST = `${BRIDGE_NAMESPACE}:ready-request`;

export type BridgeRequestPayload = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

export type BridgeRequestMessage = {
  id: string;
  payload: BridgeRequestPayload;
  source: typeof MESSAGE_SOURCE_INPAGE;
  type: typeof MESSAGE_TYPE_REQUEST;
};

export type BridgeSerializedError = {
  code?: number;
  data?: unknown;
  message: string;
};

export type BridgeResponseMessage =
  | {
      id: string;
      result: unknown;
      source: typeof MESSAGE_SOURCE_CONTENT;
      type: typeof MESSAGE_TYPE_RESPONSE;
    }
  | {
      error: BridgeSerializedError;
      id: string;
      source: typeof MESSAGE_SOURCE_CONTENT;
      type: typeof MESSAGE_TYPE_RESPONSE;
    };

export type BridgeEventMessage = {
  event: string;
  payload: unknown;
  source: typeof MESSAGE_SOURCE_CONTENT;
  type: typeof MESSAGE_TYPE_EVENT;
};

export type BridgeReadyMessage = {
  source: typeof MESSAGE_SOURCE_CONTENT;
  type: typeof MESSAGE_TYPE_READY;
};

export type BridgeReadyRequestMessage = {
  source: typeof MESSAGE_SOURCE_INPAGE;
  type: typeof MESSAGE_TYPE_READY_REQUEST;
};

export function isBridgeRequestMessage(
  data: unknown
): data is BridgeRequestMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as BridgeRequestMessage).type === MESSAGE_TYPE_REQUEST &&
    (data as BridgeRequestMessage).source === MESSAGE_SOURCE_INPAGE
  );
}

export function isBridgeResponseMessage(
  data: unknown
): data is BridgeResponseMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as BridgeResponseMessage).type === MESSAGE_TYPE_RESPONSE &&
    (data as BridgeResponseMessage).source === MESSAGE_SOURCE_CONTENT
  );
}

export function isBridgeEventMessage(
  data: unknown
): data is BridgeEventMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as BridgeEventMessage).type === MESSAGE_TYPE_EVENT &&
    (data as BridgeEventMessage).source === MESSAGE_SOURCE_CONTENT
  );
}

export function isBridgeReadyMessage(
  data: unknown
): data is BridgeReadyMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as BridgeReadyMessage).type === MESSAGE_TYPE_READY &&
    (data as BridgeReadyMessage).source === MESSAGE_SOURCE_CONTENT
  );
}

export function isBridgeReadyRequestMessage(
  data: unknown
): data is BridgeReadyRequestMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as BridgeReadyRequestMessage).type ===
      MESSAGE_TYPE_READY_REQUEST &&
    (data as BridgeReadyRequestMessage).source === MESSAGE_SOURCE_INPAGE
  );
}
