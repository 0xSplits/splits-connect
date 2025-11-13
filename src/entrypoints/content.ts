import {
  MESSAGE_SOURCE_CONTENT,
  MESSAGE_TYPE_EVENT,
  MESSAGE_TYPE_READY,
  MESSAGE_TYPE_READY_REQUEST,
  MESSAGE_TYPE_RESPONSE,
  isBridgeReadyRequestMessage,
  isBridgeRequestMessage,
  type BridgeRequestMessage,
  type BridgeSerializedError,
} from "@/utils/bridge";
import { getProviderInfo } from "@/utils/provider-info";
import { Dialog, Mode, Porto } from "porto";
import { getHost, getRelay } from "../../utils";

type ProviderEventName =
  | "accountsChanged"
  | "chainChanged"
  | "connect"
  | "disconnect"
  | "message";

export default defineContentScript({
  async main() {
    const pendingUntilReady: BridgeRequestMessage[] = [];
    let provider: ReturnType<typeof Porto.create>["provider"] | null = null;
    let porto: ReturnType<typeof Porto.create> | null = null;
    let destroyed = false;
    let initializing: Promise<void> | null = null;

    const handleRequest = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (isBridgeReadyRequestMessage(event.data)) {
        postBridgeReady();
        return;
      }
      if (!isBridgeRequestMessage(event.data)) return;
      if (!provider) {
        pendingUntilReady.push(event.data);
        void ensurePortoInitialized();
        return;
      }
      void processRequest(event.data);
    };

    const processRequest = async (message: BridgeRequestMessage) => {
      try {
        if (!provider) throw new Error("Provider not ready");
        const result = await provider.request(message.payload);
        postResponse(message.id, { result });
      } catch (error) {
        postResponse(message.id, { error: serializeError(error) });
      }
    };

    const postResponse = (
      id: string,
      payload: { result?: unknown; error?: BridgeSerializedError }
    ) => {
      window.postMessage(
        {
          ...payload,
          id,
          source: MESSAGE_SOURCE_CONTENT,
          type: MESSAGE_TYPE_RESPONSE,
        },
        "*"
      );
    };

    const postBridgeReady = () => {
      window.postMessage(
        {
          source: MESSAGE_SOURCE_CONTENT,
          type: MESSAGE_TYPE_READY,
        },
        "*"
      );
    };

    const forwardEvent =
      (eventName: ProviderEventName) =>
      (payload: unknown): void => {
        window.postMessage(
          {
            event: eventName,
            payload,
            source: MESSAGE_SOURCE_CONTENT,
            type: MESSAGE_TYPE_EVENT,
          },
          "*"
        );
      };

    const eventHandlers: Array<[ProviderEventName, (payload: unknown) => void]> =
      [
        ["accountsChanged", forwardEvent("accountsChanged")],
        ["chainChanged", forwardEvent("chainChanged")],
        ["connect", forwardEvent("connect")],
        ["disconnect", forwardEvent("disconnect")],
        ["message", forwardEvent("message")],
      ];

    window.addEventListener("message", handleRequest);
    postBridgeReady();

    const cleanup = () => {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener("message", handleRequest);
      const currentProvider = provider;
      if (currentProvider) {
        eventHandlers.forEach(([eventName, handler]) => {
          currentProvider.removeListener(
            eventName,
            handler as (...args: any[]) => void
          );
        });
      }
      porto?.destroy();
      provider = null;
      porto = null;
      pendingUntilReady.length = 0;
    };

    window.addEventListener(
      "unload",
      () => {
        cleanup();
      },
      { once: true }
    );

    browser.storage.local.onChanged.addListener((changes) => {
      if (changes.env)
        window.postMessage(
          {
            event: "trigger-reload",
          },
          "*"
        );
    });

    async function ensurePortoInitialized() {
      if (provider || destroyed) return;
      if (initializing) {
        await initializing;
        return;
      }
      initializing = (async () => {
        await waitForDocumentReady();
        if (destroyed || provider) return;

        const providerInfo = getProviderInfo(import.meta.env.MODE);
        porto = Porto.create({
          announceProvider: providerInfo,
          mode: Mode.dialog({
            host: `${getHost(import.meta.env.MODE)}/connect/`,
            renderer: Dialog.popup({
              size: {
                height: 650,
                width: 450,
              },
            }),
          }),
          relay: getRelay(import.meta.env.MODE),
        });
        provider = porto.provider;
        eventHandlers.forEach(([eventName, handler]) => {
          provider?.on(eventName, handler as (...args: any[]) => void);
        });
        while (pendingUntilReady.length > 0) {
          const queued = pendingUntilReady.shift();
          if (!queued) continue;
          void processRequest(queued);
        }
      })();
      try {
        await initializing;
      } finally {
        initializing = null;
      }
    }
  },
  matches: ["https://*/*", "http://localhost/*"],
  runAt: "document_start",
});

function serializeError(error: unknown): BridgeSerializedError {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      code?: number;
      data?: unknown;
      message?: string;
    };
    return {
      code: typeof maybeError.code === "number" ? maybeError.code : undefined,
      data: maybeError.data,
      message:
        typeof maybeError.message === "string"
          ? maybeError.message
          : String(error),
    };
  }
  return {
    message: String(error),
  };
}

function waitForDocumentReady(): Promise<void> {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), {
      once: true,
    });
  });
}
