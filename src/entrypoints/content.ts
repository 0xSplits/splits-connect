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
import { isSessionInfoMessage } from "@/utils/session-info";
import {
  CONNECTION_NETWORKS_STORAGE_KEY,
  getSiteDomain,
  isConnectionNetworksEntryFresh,
  isConnectionNetworksMessage,
  isSiteNetworkGetMessage,
  isSiteNetworkSwitchMessage,
  parseRequestedChainIds,
  resolveSiteNetworkOptions,
  toSiteNetworkOption,
  type ConnectionNetworks,
  type SiteNetworkState,
  type SiteNetworkSwitchResponse,
} from "@/utils/site-network";
import { Chains, Dialog, Mode, Porto } from "@splits/porto";
import { hexToNumber, numberToHex } from "viem";
import { hyperEvm, megaeth, robinhood, tempo, worldchain } from "viem/chains";
import { getAllowedOrigins, getHost, getRelay } from "../../utils";

export default defineContentScript({
  main() {
    const bridge = new ContentBridge(window);
    bridge.start();
    startSplitsAppRelay(window);
  },
  matches: ["https://*/*", "http://localhost/*"],
  runAt: "document_start",
});

// Relays the messages the Splits app posts to its own window (session info,
// connection networks) to the background script, which persists them for the
// popup and the dapp tabs. Only attached on the Splits origin; the background
// re-checks the sender origin before storing.
function startSplitsAppRelay(targetWindow: Window) {
  const allowedOrigins = getAllowedOrigins(import.meta.env.MODE);
  if (!allowedOrigins.includes(targetWindow.location.origin)) return;
  targetWindow.addEventListener("message", (event) => {
    if (event.source !== targetWindow) return;
    if (!allowedOrigins.includes(event.origin)) return;
    if (
      !isSessionInfoMessage(event.data) &&
      !isConnectionNetworksMessage(event.data)
    )
      return;
    browser.runtime.sendMessage(event.data).catch(() => {
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
  // Chains the dapp asked for in its last `wallet_connect`. Null when it never
  // said, which is the case for every dapp that connects via
  // `eth_requestAccounts`.
  private siteChainIds: number[] | null = null;

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

  // Answers the popup, which reaches the active tab's content script over
  // browser.tabs.sendMessage. Returning true keeps the channel open for the
  // async reply.
  private readonly handlePopupMessage = (
    message: unknown,
    _sender: unknown,
    sendResponse: (response: unknown) => void
  ) => {
    if (isSiteNetworkGetMessage(message)) {
      void this.getSiteNetworkState().then(sendResponse);
      return true;
    }
    if (isSiteNetworkSwitchMessage(message)) {
      void this.switchSiteNetwork(message.chainId).then(sendResponse);
      return true;
    }
    return undefined;
  };

  start() {
    this.targetWindow.addEventListener("message", this.handleRequest);
    this.targetWindow.addEventListener("unload", this.cleanup, { once: true });
    browser.storage.local.onChanged.addListener(this.handleStorageChange);
    browser.runtime.onMessage.addListener(this.handlePopupMessage);
    this.postBridgeReady();
  }

  private cleanup = () => {
    if (this.destroyed) return;
    this.destroyed = true;
    this.targetWindow.removeEventListener("message", this.handleRequest);
    this.targetWindow.removeEventListener("unload", this.cleanup);
    browser.storage.local.onChanged.removeListener(this.handleStorageChange);
    browser.runtime.onMessage.removeListener(this.handlePopupMessage);
    this.detachProviderEvents();
    this.porto?.destroy();
    this.provider = null;
    this.porto = null;
    this.pendingRequests.length = 0;
  };

  private async processRequest(message: BridgeRequestMessage) {
    this.recordSiteChainIds(message.payload);
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

  private recordSiteChainIds(payload: BridgeRequestMessage["payload"]) {
    if (payload.method === "wallet_connect")
      this.siteChainIds = parseRequestedChainIds(payload.params);
    if (payload.method === "wallet_disconnect") this.siteChainIds = null;
  }

  // A site counts as connected once the dapp has used the provider and Porto
  // holds an account for it. A page whose dapp never touched the provider
  // reports disconnected even if Porto persisted an account for the origin.
  // Porto answers `eth_accounts` and `eth_chainId` from its store, so neither
  // leaves the page.
  private async getSiteNetworkState(): Promise<SiteNetworkState> {
    if (!this.porto || !this.provider) return { connected: false };
    const currentChainId = await this.provider
      .request({ method: "eth_accounts" })
      .then(() => this.provider?.request({ method: "eth_chainId" }))
      .catch(() => null);
    if (!currentChainId) return { connected: false };

    const chains = this.porto.config.chains;
    const currentChain = chains.find(
      (chain) => chain.id === hexToNumber(currentChainId),
    );
    if (!currentChain) return { connected: false };

    const domain = getSiteDomain(this.targetWindow.location.hostname);
    const { chainIds, source } = resolveSiteNetworkOptions({
      walletChainIds: chains.map((chain) => chain.id),
      teamChainIds: await readTeamChainIds(domain),
      siteChainIds: this.siteChainIds,
    });
    return {
      connected: true,
      current: toSiteNetworkOption(currentChain),
      domain,
      options: chains
        .filter((chain) => chainIds.includes(chain.id))
        .map(toSiteNetworkOption),
      source,
    };
  }

  // Goes through Porto's own provider so the switch is the same one a dapp
  // request produces: the store updates and `chainChanged` reaches the page
  // through the event forwarders.
  private async switchSiteNetwork(
    chainId: number
  ): Promise<SiteNetworkSwitchResponse> {
    if (!this.provider) return { ok: false, message: "Site is not connected." };
    try {
      await this.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: numberToHex(chainId) }],
      });
      return { ok: true, state: await this.getSiteNetworkState() };
    } catch (error) {
      return { ok: false, message: serializeError(error).message };
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
      chains: [...Chains.all, worldchain, tempo, hyperEvm, robinhood, megaeth],
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
          handler as (...args: any[]) => void,
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

async function readTeamChainIds(domain: string): Promise<number[] | null> {
  const stored = await browser.storage.local.get(
    CONNECTION_NETWORKS_STORAGE_KEY,
  );
  const networks = stored[CONNECTION_NETWORKS_STORAGE_KEY] as
    | ConnectionNetworks
    | undefined;
  const entry = networks?.[domain];
  if (!entry || !isConnectionNetworksEntryFresh(entry)) return null;
  return entry.chainIds;
}

function waitForDocumentReady(): Promise<void> {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), {
      once: true,
    });
  });
}
