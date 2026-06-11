import {
  SESSION_INFO_STORAGE_KEY,
  type SessionInfo,
} from "@/utils/session-info";

const root = document.getElementById("app");
if (root) {
  void readSessionInfo().then((sessionInfo) => render(root, sessionInfo));
  browser.storage.local.onChanged.addListener((changes) => {
    if (!(SESSION_INFO_STORAGE_KEY in changes)) return;
    const next = changes[SESSION_INFO_STORAGE_KEY]?.newValue as
      | SessionInfo
      | undefined;
    render(root, next ?? null);
  });
}

async function readSessionInfo(): Promise<SessionInfo | null> {
  const stored = await browser.storage.local.get(SESSION_INFO_STORAGE_KEY);
  return (stored[SESSION_INFO_STORAGE_KEY] as SessionInfo | undefined) ?? null;
}

function render(target: HTMLElement, sessionInfo: SessionInfo | null) {
  target.replaceChildren(
    sessionInfo ? renderSignedIn(sessionInfo.user) : cloneTemplate("signed-out")
  );
}

function renderSignedIn(user: SessionInfo["user"]) {
  const view = cloneTemplate("signed-in");

  setText(view, ".user-name", user.name ?? user.email ?? "");
  if (user.name && user.email) setText(view, ".user-email", user.email);
  else view.querySelector(".user-email")?.remove();

  const source = user.name ?? user.email ?? "";
  setText(view, ".avatar-fallback", source.slice(0, 1).toUpperCase());

  // The fallback initial shows until the avatar image actually loads; a
  // broken or missing URL never swaps it out.
  const image = view.querySelector<HTMLImageElement>(".avatar-image");
  if (image && user.avatarUrl) {
    image.addEventListener(
      "load",
      () => {
        image.hidden = false;
        image.previousElementSibling?.remove();
      },
      { once: true }
    );
    image.src = user.avatarUrl;
  }

  return view;
}

function cloneTemplate(id: string) {
  const template = document.getElementById(id) as HTMLTemplateElement;
  return template.content.cloneNode(true) as DocumentFragment;
}

function setText(view: DocumentFragment, selector: string, text: string) {
  const element = view.querySelector(selector);
  if (element) element.textContent = text;
}
