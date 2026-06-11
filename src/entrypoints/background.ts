import {
  RPC_STORAGE_MESSAGE_TYPE,
  consumeRpcPayload,
} from "@/utils/rpc-storage";
import {
  SESSION_INFO_STORAGE_KEY,
  isSessionInfoMessage,
  sanitizeSessionInfo,
} from "@/utils/session-info";
import { getHost } from "../../utils";

export default defineBackground(() => {
  RpcStorageBridge.register();
  SessionInfoBridge.register();
  ContextMenu.create();
});

const allowedOrigin = new URL(getHost(import.meta.env.MODE)).origin;

type MessageSender = Parameters<
  Parameters<typeof browser.runtime.onMessageExternal.addListener>[0]
>[1];

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

  async function fetchStoredPayload(token: string) {
    const value = await consumeRpcPayload(token);
    if (!value) return { ok: false };
    return { ok: true, value };
  }
}

// Lets the Splits Teams app keep the popup's session display in sync. The app
// posts `{ type: "splits-connect:setSessionInfo", sessionInfo }` to its own
// window whenever auth state resolves, and `sessionInfo: null` when it
// resolves signed out; the content script relays it here. Sender pages are
// re-checked against the Teams origin before anything is stored.
//
// Spoofing is accepted by design: any script running on the Teams origin
// (third-party JS, other extensions' content scripts) can post this message
// and repaint the popup's display strings. The payload is sanitized below
// and the popup renders text only, so there is no injection path and nothing
// privileged to reach — and anything running on that origin can already read
// the real session from the page.
namespace SessionInfoBridge {
  export function register() {
    browser.runtime.onMessage.addListener(handleMessage);
  }

  function handleMessage(
    message: unknown,
    sender: MessageSender,
    sendResponse: (response: unknown) => void
  ) {
    if (!isSessionInfoMessage(message)) return undefined;
    if (!isAllowedSender(sender)) {
      sendResponse({ ok: false });
      return undefined;
    }
    const sessionInfo = sanitizeSessionInfo(
      (message as { sessionInfo?: unknown }).sessionInfo
    );
    void persistSessionInfo(sessionInfo)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  async function persistSessionInfo(
    sessionInfo: ReturnType<typeof sanitizeSessionInfo>
  ) {
    if (!sessionInfo) {
      await browser.storage.local.remove(SESSION_INFO_STORAGE_KEY);
      return;
    }
    await browser.storage.local.set({
      [SESSION_INFO_STORAGE_KEY]: sessionInfo,
    });
  }
}
