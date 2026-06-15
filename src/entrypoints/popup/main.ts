import {
  SESSION_INFO_STORAGE_KEY,
  isSessionInfoFresh,
  type SessionInfo,
} from "@/utils/session-info";

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
