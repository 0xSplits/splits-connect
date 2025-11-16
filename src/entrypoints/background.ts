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

  async function handleExternalMessage(
    message: unknown,
    sender: MessageSender,
    sendResponse: (response: unknown) => void
  ) {
    if (!isStorageRequest(message)) return undefined;
    if (!isAllowedSender(sender)) return { ok: false };
    const token = (message as { token?: string }).token;
    if (!token) return { ok: false };
    const result = await fetchStoredPayload(token);
    sendResponse(result);
    return result;
  }

  function isStorageRequest(message: unknown) {
    return (
      typeof message === "object" &&
      message !== null &&
      (message as { type?: string }).type === RPC_STORAGE_MESSAGE_TYPE
    );
  }

  function isAllowedSender(sender: MessageSender) {
    if (!sender.url) return false;
    try {
      const senderOrigin = new URL(sender.url).origin;
      return senderOrigin === allowedOrigin;
    } catch {
      return false;
    }
  }

  async function fetchStoredPayload(token: string) {
    const value = await consumeRpcPayload(token);
    if (!value) return { ok: false };
    return { ok: true, value };
  }
}
