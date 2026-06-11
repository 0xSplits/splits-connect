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
    sessionInfo ? renderSignedIn(sessionInfo) : renderSignedOut()
  );
}

function renderSignedOut() {
  const container = document.createElement("div");

  const title = document.createElement("h1");
  title.className = "welcome-title";
  title.textContent = "Welcome to Splits Connect!";

  const text = document.createElement("p");
  text.className = "welcome-text";
  text.append(
    "You do not need to do anything in this extension — when you follow the connect flow on your application, you should see Splits as a wallet option. If you do not, please reach out to "
  );
  const support = document.createElement("a");
  support.href = "mailto:support@splits.org";
  support.textContent = "support@splits.org";
  text.append(support, ".");

  container.append(title, text);
  return container;
}

function renderSignedIn(sessionInfo: SessionInfo) {
  const container = document.createElement("div");

  const user = document.createElement("div");
  user.className = "user";

  const details = document.createElement("div");
  details.className = "user-details";
  const name = document.createElement("div");
  name.className = "user-name";
  name.textContent = sessionInfo.user.name ?? sessionInfo.user.email ?? "";
  details.append(name);
  if (sessionInfo.user.name && sessionInfo.user.email) {
    const email = document.createElement("div");
    email.className = "user-email";
    email.textContent = sessionInfo.user.email;
    details.append(email);
  }

  user.append(renderAvatar(sessionInfo.user), details);
  container.append(user);

  const rows: Array<[string, string]> = [];
  if (sessionInfo.org) rows.push(["Organization", sessionInfo.org.name]);
  if (sessionInfo.smartAccount)
    rows.push(["Smart account", sessionInfo.smartAccount.name]);
  if (rows.length > 0) {
    const context = document.createElement("div");
    context.className = "context";
    for (const [label, value] of rows) {
      const row = document.createElement("div");
      row.className = "context-row";
      const labelEl = document.createElement("span");
      labelEl.className = "context-label";
      labelEl.textContent = label;
      const valueEl = document.createElement("span");
      valueEl.className = "context-value";
      valueEl.textContent = value;
      row.append(labelEl, valueEl);
      context.append(row);
    }
    container.append(context);
  }

  return container;
}

function renderAvatar(user: SessionInfo["user"]) {
  if (user.avatarUrl) {
    const image = document.createElement("img");
    image.className = "avatar";
    image.src = user.avatarUrl;
    image.alt = "";
    image.addEventListener(
      "error",
      () => image.replaceWith(renderAvatarFallback(user)),
      { once: true }
    );
    return image;
  }
  return renderAvatarFallback(user);
}

function renderAvatarFallback(user: SessionInfo["user"]) {
  const fallback = document.createElement("div");
  fallback.className = "avatar avatar-fallback";
  const source = user.name ?? user.email ?? "";
  fallback.textContent = source.slice(0, 1).toUpperCase();
  return fallback;
}
