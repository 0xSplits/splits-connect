import {
  MESSAGE_SOURCE_INPAGE,
  MESSAGE_TYPE_REQUEST,
  type BridgeEventMessage,
  type BridgeRequestPayload,
  type BridgeResponseMessage,
} from "@/utils/bridge";
import type { EIP1193Provider } from "viem";
import {
  ProviderEventMap,
  ProviderEventName,
  isProviderEvent,
} from "@/utils/provider-events";

export class SplitsEthereumProvider implements EIP1193Provider {
  readonly isMetaMask = false;
  readonly isSplitsConnect = true;
  chainId: string | null = null;
  selectedAddress: string | null = null;

  private readonly pending = new Map<
    string,
    {
      reject: (reason?: unknown) => void;
      resolve: (value: unknown) => void;
    }
  >();
  private readonly listeners = new Map<
    ProviderEventName,
    Set<(payload: unknown) => void>
  >();
  private bridgeReady = false;
  private messageSequence = 0;
  private outboundQueue: Array<{
    id: string;
    payload: BridgeRequestPayload;
  }> = [];

  readonly request: EIP1193Provider["request"] = async (args) => {
    if (!args || typeof args.method !== "string")
      throw new Error("Invalid request");

    const id = this.createRequestId();
    const payload: BridgeRequestPayload = {
      method: args.method,
      params: args.params as BridgeRequestPayload["params"],
    };
    const message = {
      id,
      payload,
      source: MESSAGE_SOURCE_INPAGE,
      type: MESSAGE_TYPE_REQUEST,
    } as const;

    this.enqueueOrSend(message);

    return await new Promise((resolve, reject) => {
      this.pending.set(id, {
        reject,
        resolve: resolve as (value: unknown) => void,
      });
    });
  };

  on<event extends ProviderEventName>(
    event: event,
    listener: ProviderEventMap[event]
  ): void {
    this.addListener(event, listener);
  }

  removeListener<event extends ProviderEventName>(
    event: event,
    listener: ProviderEventMap[event]
  ): void {
    const listeners = this.listeners.get(event);
    listeners?.delete(listener as (payload: unknown) => void);
  }

  addListener<event extends ProviderEventName>(
    event: event,
    listener: ProviderEventMap[event]
  ) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(listener as (payload: unknown) => void);
    return this;
  }

  once<event extends ProviderEventName>(
    event: event,
    listener: ProviderEventMap[event]
  ) {
    const onceListener = ((payload: unknown) => {
      this.removeListener(event, onceListener as ProviderEventMap[event]);
      (listener as (payload: unknown) => void)(payload);
    }) as ProviderEventMap[event];
    return this.addListener(event, onceListener);
  }

  off<event extends ProviderEventName>(
    event: event,
    listener: ProviderEventMap[event]
  ) {
    this.removeListener(event, listener);
    return this;
  }

  emit(event: ProviderEventName, payload: unknown) {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(payload);
      } catch {
        // Ignore listener errors so one consumer cannot break others.
      }
    });
  }

  handleResponse(message: BridgeResponseMessage) {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if ("error" in message) {
      const error = new Error(message.error.message);
      if (typeof message.error.code === "number")
        (error as Error & { code?: number }).code = message.error.code;
      if (message.error.data !== undefined)
        (error as Error & { data?: unknown }).data = message.error.data;
      pending.reject(error);
      return;
    }
    pending.resolve(message.result);
  }

  handleEvent(message: BridgeEventMessage) {
    if (message.event === "accountsChanged") {
      const accounts = Array.isArray(message.payload)
        ? (message.payload as string[])
        : [];
      this.selectedAddress = accounts[0] ?? null;
    }
    if (message.event === "chainChanged") {
      this.chainId =
        typeof message.payload === "string" ? message.payload : null;
    }
    if (isProviderEvent(message.event)) {
      this.emit(message.event, message.payload);
    }
  }

  markBridgeReady() {
    if (this.bridgeReady) return;
    this.bridgeReady = true;
    while (this.outboundQueue.length > 0) {
      const message = this.outboundQueue.shift();
      if (!message) continue;
      this.postMessage(message.id, message.payload);
    }
  }

  isReady() {
    return this.bridgeReady;
  }

  private createRequestId() {
    return `${Date.now()}:${this.messageSequence++}`;
  }

  private enqueueOrSend(message: {
    id: string;
    payload: BridgeRequestPayload;
  }) {
    if (!this.bridgeReady) {
      this.outboundQueue.push(message);
      return;
    }
    this.postMessage(message.id, message.payload);
  }

  private postMessage(id: string, payload: BridgeRequestPayload) {
    window.postMessage(
      {
        id,
        payload,
        source: MESSAGE_SOURCE_INPAGE,
        type: MESSAGE_TYPE_REQUEST,
      },
      "*"
    );
  }
}
