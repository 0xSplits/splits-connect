import {
  RPC_STORAGE_MESSAGE_TYPE,
  consumeRpcPayload,
} from "@/utils/rpc-storage";
import { getHost } from "../../utils";

export default defineBackground(() => {
  RpcStorageBridge.register();
  ContextMenu.create();
});

namespace ContextMenu {
  export function create() {
    browser.contextMenus.create({
      contexts: ["action"],
      id: "app",
      title: "Splits Teams",
    });

    browser.contextMenus.onClicked.addListener(async (info) => {
      if (info.menuItemId === "app")
        browser.tabs.create({
          url: "https://teams.splits.org",
        });
    });
  }
}

namespace RpcStorageBridge {
  const allowedOrigin = new URL(getHost(import.meta.env.MODE)).origin;
  type MessageSender = Parameters<
    Parameters<typeof browser.runtime.onMessageExternal.addListener>[0]
  >[1];

  export function register() {
    browser.runtime.onMessageExternal.addListener(handleExternalMessage);
  }

  function handleExternalMessage(
    message: unknown,
    sender: MessageSender,
    sendResponse: (response: unknown) => void
  ) {
    if (!isStorageRequest(message)) return undefined;
    if (!isAllowedSender(sender)) {
      sendResponse({ ok: false });
      return undefined;
    }
    const token = (message as { token?: string }).token;
    if (!token) {
      sendResponse({ ok: false });
      return undefined;
    }
    // Keep the message channel open for browsers that still rely on sendResponse.
    void fetchStoredPayload(token)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  function isStorageRequest(message: unknown) {
    return (
      typeof message === "object" &&
      message !== null &&
      (message as { type?: string }).type === RPC_STORAGE_MESSAGE_TYPE
    );
  }

  function isAllowedSender(sender: MessageSender) {
    const senderOrigin = getSenderOrigin(sender);
    if (!senderOrigin) return false;
    return senderOrigin === allowedOrigin;
  }

  function getSenderOrigin(sender: MessageSender) {
    if (typeof sender.origin === "string" && sender.origin.length > 0) {
      return sender.origin;
    }
    if (typeof sender.url === "string" && sender.url.length > 0) {
      try {
        return new URL(sender.url).origin;
      } catch {
        return null;
      }
    }
    return null;
  }

  async function fetchStoredPayload(token: string) {
    const value = await consumeRpcPayload(token);
    if (!value) return { ok: false };
    return { ok: true, value };
  }
}
