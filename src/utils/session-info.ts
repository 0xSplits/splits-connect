// MUST match the message sent by 0xSplits/splits-teams →
// utils/splitsConnectExtension.ts. The Teams app posts this message to its
// own window; the content script relays it to the background, which stores
// the sanitized result for the popup.
export const SESSION_INFO_STORAGE_KEY = "splits:session-info";
export const SESSION_INFO_MESSAGE_TYPE = "splits-connect:setSessionInfo";

// The popup treats stored info older than this as signed out. The Teams app
// re-pushes on every load, so the only sessions that age out are ones that
// ended while no Teams tab was open (expiry, remote logout, cleared cookies)
// — without this, those would display user details indefinitely.
export const SESSION_INFO_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_FIELD_LENGTH = 256;

export type SessionInfo = {
  user: {
    name?: string;
    email?: string;
    avatarUrl?: string;
  };
  updatedAt: number;
};

export function isSessionInfoFresh(
  sessionInfo: SessionInfo,
  now = Date.now()
) {
  return now - sessionInfo.updatedAt <= SESSION_INFO_MAX_AGE_MS;
}

export function isSessionInfoMessage(message: unknown) {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: string }).type === SESSION_INFO_MESSAGE_TYPE
  );
}

// Returns null when the payload has no usable user — callers treat that as
// signed out and clear the stored value.
export function sanitizeSessionInfo(input: unknown): SessionInfo | null {
  if (typeof input !== "object" || input === null) return null;
  const user = sanitizeUser((input as { user?: unknown }).user);
  if (!user) return null;
  return { updatedAt: Date.now(), user };
}

function sanitizeUser(input: unknown): SessionInfo["user"] | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as { name?: unknown; email?: unknown; avatarUrl?: unknown };
  const name = sanitizeText(raw.name);
  const email = sanitizeText(raw.email);
  const avatarUrl = sanitizeHttpUrl(raw.avatarUrl);
  if (!name && !email) return null;
  return {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function sanitizeText(input: unknown) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_FIELD_LENGTH);
}

function sanitizeHttpUrl(input: unknown) {
  const text = sanitizeText(input);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
