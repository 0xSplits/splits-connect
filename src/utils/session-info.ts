// MUST match the message sent by 0xSplits/splits-teams →
// utils/splitsConnectExtension.ts. The Teams app posts this message to its
// own window; the content script relays it to the background, which stores
// the sanitized result for the popup.
export const SESSION_INFO_STORAGE_KEY = "splits:session-info";
export const SESSION_INFO_MESSAGE_TYPE = "splits-connect:setSessionInfo";

const MAX_FIELD_LENGTH = 256;

export type SessionInfo = {
  user: {
    name?: string;
    email?: string;
    avatarUrl?: string;
  };
  org: { name: string } | null;
  smartAccount: { name: string } | null;
  updatedAt: number;
};

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
  const raw = input as {
    user?: unknown;
    org?: unknown;
    smartAccount?: unknown;
  };

  const user = sanitizeUser(raw.user);
  if (!user) return null;

  return {
    org: sanitizeNamed(raw.org),
    smartAccount: sanitizeNamed(raw.smartAccount),
    updatedAt: Date.now(),
    user,
  };
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

function sanitizeNamed(input: unknown): { name: string } | null {
  if (typeof input !== "object" || input === null) return null;
  const name = sanitizeText((input as { name?: unknown }).name);
  if (!name) return null;
  return { name };
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
