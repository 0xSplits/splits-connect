import {
  SESSION_INFO_STORAGE_KEY,
  isSessionInfoFresh,
  type SessionInfo,
} from "@/utils/session-info";
import {
  SITE_NETWORK_GET_MESSAGE_TYPE,
  SITE_NETWORK_SWITCH_MESSAGE_TYPE,
  type SiteNetworkGetMessage,
  type SiteNetworkOptionsSource,
  type SiteNetworkState,
  type SiteNetworkSwitchMessage,
  type SiteNetworkSwitchResponse,
} from "@/utils/site-network";

// Copy for the empty state and for the hint under the dropdown, by where the
// option list came from.
const NO_OPTIONS_MESSAGE: Record<SiteNetworkOptionsSource, string> = {
  "team-and-site": "No network is supported by both this site and your team.",
  team: "Your team has no networks enabled.",
  site: "This site requested no network that Splits supports.",
  wallet: "Splits supports no network on this site.",
};

const OPTIONS_HINT: Record<SiteNetworkOptionsSource, string> = {
  "team-and-site": "Networks supported by both this site and your team.",
  team: "Networks enabled for your team.",
  site: "Networks this site requested.",
  wallet: "Networks supported by Splits. Open Splits to narrow this to your team.",
};

const session = document.getElementById("session");
if (session) {
  void readSessionInfo().then((sessionInfo) => render(session, sessionInfo));
  browser.storage.local.onChanged.addListener((changes) => {
    if (!(SESSION_INFO_STORAGE_KEY in changes)) return;
    const next = changes[SESSION_INFO_STORAGE_KEY]?.newValue as
      | SessionInfo
      | undefined;
    render(session, next ?? null);
  });
}

const network = document.getElementById("network");
if (network) {
  void readSiteNetworkState().then((state) =>
    renderNetwork(network, state, { error: null })
  );
}

async function readSessionInfo(): Promise<SessionInfo | null> {
  const stored = await browser.storage.local.get(SESSION_INFO_STORAGE_KEY);
  return (stored[SESSION_INFO_STORAGE_KEY] as SessionInfo | undefined) ?? null;
}

// The welcome message is static in the HTML and always visible; this only
// fills (or hides) the "Signed in as" card below it.
function render(target: HTMLElement, sessionInfo: SessionInfo | null) {
  const fresh =
    sessionInfo && isSessionInfoFresh(sessionInfo) ? sessionInfo : null;
  if (!fresh) {
    target.replaceChildren();
    target.hidden = true;
    return;
  }
  target.replaceChildren(renderUser(fresh.user));
  target.hidden = false;
}

function renderUser(user: SessionInfo["user"]) {
  const template = document.getElementById("signed-in") as HTMLTemplateElement;
  const view = template.content.cloneNode(true) as DocumentFragment;

  setText(view, ".user-name", user.name ?? user.email ?? "");
  if (user.name && user.email) setText(view, ".user-email", user.email);
  else view.querySelector(".user-email")?.remove();

  const source = user.name ?? user.email ?? "";
  setText(view, ".avatar-fallback", source.slice(0, 1).toUpperCase());

  // The fallback initial shows until the avatar image actually loads; a
  // broken or missing URL never swaps it out.
  const image = view.querySelector<HTMLImageElement>(".avatar-image");
  const fallback = view.querySelector<HTMLElement>(".avatar-fallback");
  if (image && fallback && user.avatarUrl) {
    image.addEventListener(
      "load",
      () => {
        image.hidden = false;
        fallback.remove();
      },
      { once: true }
    );
    image.src = user.avatarUrl;
  }

  return view;
}

function setText(view: DocumentFragment, selector: string, text: string) {
  const element = view.querySelector(selector);
  if (element) element.textContent = text;
}

// Asks the content script of the active tab. Any failure (no content script
// on the page, a tab the extension cannot reach) reads as "not connected".
async function readSiteNetworkState(): Promise<SiteNetworkState> {
  const tabId = await getActiveTabId();
  if (tabId === null) return { connected: false };
  try {
    const message: SiteNetworkGetMessage = {
      type: SITE_NETWORK_GET_MESSAGE_TYPE,
    };
    const state = (await browser.tabs.sendMessage(tabId, message)) as
      | SiteNetworkState
      | undefined;
    return state ?? { connected: false };
  } catch {
    return { connected: false };
  }
}

async function switchSiteNetwork(
  chainId: number
): Promise<SiteNetworkSwitchResponse> {
  const tabId = await getActiveTabId();
  if (tabId === null) return { ok: false, message: "No active tab." };
  try {
    const message: SiteNetworkSwitchMessage = {
      chainId,
      type: SITE_NETWORK_SWITCH_MESSAGE_TYPE,
    };
    const response = (await browser.tabs.sendMessage(tabId, message)) as
      | SiteNetworkSwitchResponse
      | undefined;
    return response ?? { ok: false, message: "The site did not respond." };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

// Shown only for an established connection on the active tab. The dropdown
// lists the resolved options with the current network selected; when the
// current network is not among them (a dapp switched to one the team has not
// enabled) it is shown as a disabled first entry so the user still sees it.
function renderNetwork(
  target: HTMLElement,
  state: SiteNetworkState,
  view: { error: string | null }
) {
  if (!state.connected) {
    target.replaceChildren();
    target.hidden = true;
    return;
  }
  const template = document.getElementById(
    "site-network"
  ) as HTMLTemplateElement;
  const fragment = template.content.cloneNode(true) as DocumentFragment;

  setText(fragment, ".network-site", state.domain);

  const select = fragment.querySelector<HTMLSelectElement>(".network-select");
  const hint = fragment.querySelector<HTMLElement>(".network-hint");
  const error = fragment.querySelector<HTMLElement>(".network-error");
  if (!select || !hint || !error) return;

  const currentListed = state.options.some(
    (option) => option.chainId === state.current.chainId
  );
  if (!currentListed) {
    select.append(
      createOption(state.current.chainId, `${state.current.name} (current)`, {
        disabled: true,
      })
    );
  }
  state.options.forEach((option) =>
    select.append(createOption(option.chainId, option.name))
  );
  select.value = String(state.current.chainId);

  if (state.options.length === 0) {
    select.disabled = true;
    hint.textContent = NO_OPTIONS_MESSAGE[state.source];
  } else {
    hint.textContent = OPTIONS_HINT[state.source];
  }

  if (view.error) {
    error.textContent = view.error;
    error.hidden = false;
  }

  select.addEventListener("change", () => {
    const chainId = Number(select.value);
    select.disabled = true;
    void switchSiteNetwork(chainId).then((response) => {
      if (response.ok) {
        renderNetwork(target, response.state, { error: null });
        return;
      }
      renderNetwork(target, state, { error: response.message });
    });
  });

  target.replaceChildren(fragment);
  target.hidden = false;
}

function createOption(
  chainId: number,
  label: string,
  attributes: { disabled?: boolean } = {}
) {
  const option = document.createElement("option");
  option.value = String(chainId);
  option.textContent = label;
  option.disabled = attributes.disabled ?? false;
  return option;
}
