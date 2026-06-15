import {
  MESSAGE_SOURCE_CONTENT,
  MESSAGE_TYPE_EVENT,
  MESSAGE_TYPE_READY,
  MESSAGE_TYPE_RESPONSE,
  isBridgeReadyRequestMessage,
  isBridgeRequestMessage,
  type BridgeRequestMessage,
  type BridgeSerializedError,
} from "@/utils/bridge";
import {
  PROVIDER_EVENTS,
  type ProviderEventName,
} from "@/utils/provider-events";
import { getProviderInfo } from "@/utils/provider-info";
import { maybeOffloadLargeRpc } from "@/utils/rpc-offload";
import {
  SESSION_INFO_MESSAGE_TYPE,
  isSessionInfoMessage,
} from "@/utils/session-info";
import { Chains, Dialog, Mode, Porto } from "@splits/porto";
import { tempo, worldchain } from "viem/chains";
import { getHost, getRelay } from "../../utils";

export default defineContentScript({
  main() {
    const bridge = new ContentBridge(window);
    bridge.start();
    startSessionInfoRelay(window);
  },
  matches: ["https://*/*", "http://localhost/*"],
  runAt: "document_start",
});

// Relays session info posted by the Splits Teams app to the background
// script, which persists it for the popup. Only attached on the Teams
// origin; the background re-checks the sender origin before storing.
function startSessionInfoRelay(targetWindow: Window) {
  const allowedOrigin = new URL(getHost(import.meta.env.MODE)).origin;
  if (targetWindow.location.origin !== allowedOrigin) return;
  targetWindow.addEventListener("message", (event) => {
    if (event.source !== targetWindow) return;
    if (event.origin !== allowedOrigin) return;
    if (!isSessionInfoMessage(event.data)) return;
    browser.runtime
      .sendMessage({
        sessionInfo: (event.data as { sessionInfo?: unknown }).sessionInfo,
        type: SESSION_INFO_MESSAGE_TYPE,
      })
      .catch(() => {
        // Background may be restarting; the next update will land.
      });
  });
}

class ContentBridge {
  private readonly pendingRequests: BridgeRequestMessage[] = [];
  private readonly eventHandlers: Array<
    [ProviderEventName, (payload: unknown) => void]
  >;
  private provider: ReturnType<typeof Porto.create>["provider"] | null = null;
  private porto: ReturnType<typeof Porto.create> | null = null;
  private destroyed = false;
  private initializing: Promise<void> | null = null;

  constructor(private readonly targetWindow: Window) {
    this.eventHandlers = createProviderEventForwarders(targetWindow);
  }

  private readonly handleRequest = (event: MessageEvent) => {
    if (event.source !== this.targetWindow) return;
    if (isBridgeReadyRequestMessage(event.data)) {
      this.postBridgeReady();
      return;
    }
    if (!isBridgeRequestMessage(event.data)) return;
    if (!this.provider) {
      this.pendingRequests.push(event.data);
      void this.ensurePortoInitialized();
      return;
    }
    void this.processRequest(event.data);
  };

  private readonly handleStorageChange: Parameters<
    typeof browser.storage.local.onChanged.addListener
  >[0] = (changes) => {
    if (changes.env) {
      this.targetWindow.postMessage(
        {
          event: "trigger-reload",
        },
        "*",
      );
    }
  };

  start() {
    this.targetWindow.addEventListener("message", this.handleRequest);
    this.targetWindow.addEventListener("unload", this.cleanup, { once: true });
    browser.storage.local.onChanged.addListener(this.handleStorageChange);
    this.postBridgeReady();
  }

  private cleanup = () => {
    if (this.destroyed) return;
    this.destroyed = true;
    this.targetWindow.removeEventListener("message", this.handleRequest);
    this.targetWindow.removeEventListener("unload", this.cleanup);
    browser.storage.local.onChanged.removeListener(this.handleStorageChange);
    this.detachProviderEvents();
    this.porto?.destroy();
    this.provider = null;
    this.porto = null;
    this.pendingRequests.length = 0;
  };

  private async processRequest(message: BridgeRequestMessage) {
    try {
      if (!this.provider) throw new Error("Provider not ready");
      const normalizedPayload = await maybeOffloadLargeRpc(
        browser.runtime.id,
        message.payload,
      );
      const result = await this.provider.request(normalizedPayload);
      this.postResponse(message.id, { result });
    } catch (error) {
      this.postResponse(message.id, { error: serializeError(error) });
    }
  }

  private postResponse(
    id: string,
    payload: { result?: unknown; error?: BridgeSerializedError },
  ) {
    this.targetWindow.postMessage(
      {
        ...payload,
        id,
        source: MESSAGE_SOURCE_CONTENT,
        type: MESSAGE_TYPE_RESPONSE,
      },
      "*",
    );
  }

  private postBridgeReady() {
    this.targetWindow.postMessage(
      {
        source: MESSAGE_SOURCE_CONTENT,
        type: MESSAGE_TYPE_READY,
      },
      "*",
    );
  }

  private async ensurePortoInitialized() {
    if (this.provider || this.destroyed) return;
    if (this.initializing) {
      await this.initializing;
      return;
    }
    this.initializing = this.createPorto();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async createPorto() {
    await waitForDocumentReady();
    if (this.destroyed || this.provider) return;

    const providerInfo = getProviderInfo(import.meta.env.MODE);
    this.porto = Porto.create({
      announceProvider: providerInfo,
      chains: [...Chains.all, worldchain, tempo],
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
    this.provider = this.porto.provider;
    this.attachProviderEvents();
    this.flushPendingRequests();
  }

  private attachProviderEvents() {
    const currentProvider = this.provider;
    if (!currentProvider) return;
    this.eventHandlers.forEach(([eventName, handler]) => {
      currentProvider.on(eventName, handler as (...args: any[]) => void);
    });
  }

  private detachProviderEvents() {
    const currentProvider = this.provider;
    if (!currentProvider) return;
    this.eventHandlers.forEach(([eventName, handler]) => {
      try {
        currentProvider?.removeListener(
          eventName,
          handler as (...args: any[]) => void
        );
      } catch {
        // Ignore errors during cleanup — the provider may be in an
        // indeterminate state (e.g. window unload before full init).
      }
    });
  }

  private flushPendingRequests() {
    while (this.pendingRequests.length > 0) {
      const queued = this.pendingRequests.shift();
      if (!queued) continue;
      void this.processRequest(queued);
    }
  }
}

function createProviderEventForwarders(
  targetWindow: Window,
): Array<[ProviderEventName, (payload: unknown) => void]> {
  return PROVIDER_EVENTS.map(
    (eventName): [ProviderEventName, (payload: unknown) => void] => [
      eventName,
      (payload: unknown) => {
        targetWindow.postMessage(
          {
            event: eventName,
            payload,
            source: MESSAGE_SOURCE_CONTENT,
            type: MESSAGE_TYPE_EVENT,
          },
          "*",
        );
      },
    ],
  );
}

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
