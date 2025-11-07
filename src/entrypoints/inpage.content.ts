import {
  MESSAGE_SOURCE_INPAGE,
  MESSAGE_TYPE_EVENT,
  MESSAGE_TYPE_READY,
  MESSAGE_TYPE_READY_REQUEST,
  MESSAGE_TYPE_REQUEST,
  isBridgeEventMessage,
  isBridgeReadyMessage,
  isBridgeResponseMessage,
  type BridgeEventMessage,
  type BridgeRequestPayload,
  type BridgeResponseMessage,
} from "@/utils/bridge";
import { getProviderInfo } from "@/utils/provider-info";

type ProviderEventName =
  | "accountsChanged"
  | "chainChanged"
  | "connect"
  | "disconnect"
  | "message";

type ProviderEventListener = (payload: unknown) => void;

class SplitsEthereumProvider {
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
    Set<ProviderEventListener>
  >();
  private bridgeReady = false;
  private messageSequence = 0;
  private outboundQueue: Array<{
    id: string;
    payload: BridgeRequestPayload;
  }> = [];

  request(args: BridgeRequestPayload): Promise<unknown> {
    if (!args || typeof args.method !== "string")
      return Promise.reject(new Error("Invalid request"));

    const id = this.createRequestId();
    const payload = {
      id,
      payload: {
        method: args.method,
        params: args.params,
      },
      source: MESSAGE_SOURCE_INPAGE,
      type: MESSAGE_TYPE_REQUEST,
    } as const;

    this.enqueueOrSend(payload);

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(event: ProviderEventName, listener: ProviderEventListener) {
    return this.addListener(event, listener);
  }

  once(event: ProviderEventName, listener: ProviderEventListener) {
    const onceListener: ProviderEventListener = (payload) => {
      this.removeListener(event, onceListener);
      listener(payload);
    };
    return this.addListener(event, onceListener);
  }

  removeListener(event: ProviderEventName, listener: ProviderEventListener) {
    const listeners = this.listeners.get(event);
    listeners?.delete(listener);
    return this;
  }

  addListener(event: ProviderEventName, listener: ProviderEventListener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(listener);
    return this;
  }

  // EIP-1193 compatibility aliases.
  off(event: ProviderEventName, listener: ProviderEventListener) {
    return this.removeListener(event, listener);
  }

  emit(event: ProviderEventName, payload: unknown) {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(payload);
      } catch {
        // swallow listener errors to avoid breaking consumers
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
    if (isProviderEvent(message.event)) this.emit(message.event, message.payload);
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

function isProviderEvent(value: string): value is ProviderEventName {
  return (
    value === "accountsChanged" ||
    value === "chainChanged" ||
    value === "connect" ||
    value === "disconnect" ||
    value === "message"
  );
}

export default defineContentScript({
  main() {
    const provider = new SplitsEthereumProvider();
    const providerInfo = getProviderInfo(import.meta.env.MODE);
    let handshakeInterval: number | null = null;
    const announceEip6963Provider = () => {
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: providerInfo,
            provider,
          },
        })
      );
    };
    window.addEventListener("eip6963:requestProvider", announceEip6963Provider);

    const stopHandshake = () => {
      if (handshakeInterval === null) return;
      clearInterval(handshakeInterval);
      handshakeInterval = null;
    };

    const requestBridgeHandshake = () => {
      window.postMessage(
        {
          source: MESSAGE_SOURCE_INPAGE,
          type: MESSAGE_TYPE_READY_REQUEST,
        },
        "*"
      );
    };

    const ensureHandshake = () => {
      requestBridgeHandshake();
      if (handshakeInterval !== null) return;
      handshakeInterval = window.setInterval(() => {
        if (provider.isReady()) {
          stopHandshake();
          return;
        }
        requestBridgeHandshake();
      }, 250);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (isBridgeReadyMessage(event.data)) {
        provider.markBridgeReady();
        if (provider.isReady()) stopHandshake();
        return;
      }
      if (isBridgeResponseMessage(event.data)) {
        provider.handleResponse(event.data);
        return;
      }
      if (isBridgeEventMessage(event.data)) {
        provider.handleEvent(event.data);
        return;
      }
      if (
        event.data &&
        typeof event.data === "object" &&
        "event" in event.data &&
        (event.data as { event?: string }).event === "trigger-reload"
      ) {
        window.location.reload();
      }
    };

    window.addEventListener("message", handleMessage);
    ensureHandshake();

    const injectProvider = () => {
      (window as any).ethereum = provider;
      (window as any).splitsEthereum = provider;
      window.dispatchEvent(new Event("ethereum#initialized"));
      announceEip6963Provider();
    };

    if ((window as any).ethereum) {
      console.warn("splits-connect: window.ethereum already defined, overriding");
    }
    injectProvider();
  },
  matches: ["https://*/*", "http://localhost/*"],
  runAt: "document_start",
  world: "MAIN",
});
