import {
  MESSAGE_SOURCE_INPAGE,
  MESSAGE_TYPE_READY_REQUEST,
  isBridgeEventMessage,
  isBridgeReadyMessage,
  isBridgeResponseMessage,
} from "@/utils/bridge";
import { SplitsEthereumProvider } from "@/providers/splits-ethereum-provider";
import { type ProviderInfo, getProviderInfo } from "@/utils/provider-info";

export default defineContentScript({
  main() {
    const provider = new SplitsEthereumProvider();
    const providerInfo = getProviderInfo(import.meta.env.MODE);
    const { announceProvider, cleanup } = setupBridgeHandshake(
      provider,
      providerInfo
    );
    injectProvider(provider);
    announceProvider();
    window.addEventListener("unload", cleanup, { once: true });
  },
  matches: ["https://*/*", "http://localhost/*"],
  runAt: "document_start",
  world: "MAIN",
});

function setupBridgeHandshake(
  provider: SplitsEthereumProvider,
  providerInfo: ProviderInfo
) {
  let handshakeInterval: number | null = null;

  const announceProvider = () => {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: providerInfo,
          provider,
        },
      })
    );
  };
  window.addEventListener("eip6963:requestProvider", announceProvider);

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

  return {
    announceProvider,
    cleanup: () => {
      stopHandshake();
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("eip6963:requestProvider", announceProvider);
    },
  };
}

function injectProvider(provider: SplitsEthereumProvider) {
  const target = window as typeof window & {
    ethereum?: unknown;
    splitsEthereum?: unknown;
  };
  if (target.ethereum) {
    console.warn("splits-connect: window.ethereum already defined, overriding");
  }
  target.ethereum = provider;
  target.splitsEthereum = provider;
  window.dispatchEvent(new Event("ethereum#initialized"));
}
