import type { Chain } from "viem";

// MUST match the message sent by 0xSplits/splits-teams →
// utils/splitsConnectExtension.ts. The Splits app posts, for each site it
// connected to a team, the networks that team has enabled; the content script
// relays it to the background, which merges the sanitized entries into storage
// for the dapp tabs to read.
export const CONNECTION_NETWORKS_MESSAGE_TYPE =
  "splits-connect:setConnectionNetworks";
export const CONNECTION_NETWORKS_STORAGE_KEY = "splits:connection-networks";

// Popup → content script of the active tab, over browser.tabs.sendMessage.
export const SITE_NETWORK_GET_MESSAGE_TYPE = "splits-connect:getSiteNetwork";
export const SITE_NETWORK_SWITCH_MESSAGE_TYPE =
  "splits-connect:switchSiteNetwork";

// RFC 1035 caps a hostname at 253 characters.
const MAX_DOMAIN_LENGTH = 253;
// Starting point with no data yet. Well above the ~20 chains Porto is
// configured with; raise it when the chain list grows past it.
const MAX_CHAIN_IDS_PER_ENTRY = 64;
// Starting point with no data yet. A user connecting to more than 200 distinct
// sites is unheard of; raise it if support ever hears otherwise.
const MAX_STORED_CONNECTIONS = 200;
// Same window as SESSION_INFO_MAX_AGE_MS. The Splits app re-publishes an
// org's connections on every load with that org active, so only lists for
// orgs the user stopped opening age out, and the popup then falls back to the
// wallet's chains instead of narrowing by a list nobody refreshed.
export const CONNECTION_NETWORKS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ConnectionNetworksEntry = {
  chainIds: number[];
  updatedAt: number;
};

// Keyed by site domain: the hostname without a leading "www.", which is the
// key the Splits app uses for its own connection store.
export type ConnectionNetworks = Record<string, ConnectionNetworksEntry>;

export type SiteNetworkOption = {
  chainId: number;
  name: string;
};

// Where the option list came from, so the popup can say what it is showing.
export type SiteNetworkOptionsSource =
  | "team-and-site"
  | "team"
  | "site"
  | "wallet";

export type SiteNetworkState =
  | { connected: false }
  | {
      connected: true;
      domain: string;
      current: SiteNetworkOption;
      options: SiteNetworkOption[];
      source: SiteNetworkOptionsSource;
    };

export type SiteNetworkGetMessage = {
  type: typeof SITE_NETWORK_GET_MESSAGE_TYPE;
};

export type SiteNetworkSwitchMessage = {
  chainId: number;
  type: typeof SITE_NETWORK_SWITCH_MESSAGE_TYPE;
};

export type SiteNetworkSwitchResponse =
  | { ok: true; state: SiteNetworkState }
  | { ok: false; message: string };

// MUST match getDomainFromUrl in 0xSplits/splits-teams → utils/index.ts, which
// keys the connection store the Splits app posts from.
export function getSiteDomain(hostname: string) {
  return hostname.replace(/^www\./, "");
}

export function isConnectionNetworksMessage(message: unknown) {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: string }).type === CONNECTION_NETWORKS_MESSAGE_TYPE
  );
}

export function isSiteNetworkGetMessage(
  message: unknown
): message is SiteNetworkGetMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: string }).type === SITE_NETWORK_GET_MESSAGE_TYPE
  );
}

export function isSiteNetworkSwitchMessage(
  message: unknown
): message is SiteNetworkSwitchMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: string }).type === SITE_NETWORK_SWITCH_MESSAGE_TYPE &&
    isChainId((message as { chainId?: unknown }).chainId)
  );
}

// Drops entries that do not look like a domain → chain id list. Returns an
// empty map for an unusable payload, which merges as a no-op.
export function sanitizeConnectionNetworks(
  input: unknown,
  now = Date.now()
): ConnectionNetworks {
  if (typeof input !== "object" || input === null) return {};
  return Object.entries(input).reduce<ConnectionNetworks>(
    (acc, [domain, chainIds]) => {
      if (!isDomain(domain) || !Array.isArray(chainIds)) return acc;
      const uniqueChainIds = Array.from(new Set(chainIds.filter(isChainId)));
      acc[domain] = {
        chainIds: uniqueChainIds.slice(0, MAX_CHAIN_IDS_PER_ENTRY),
        updatedAt: now,
      };
      return acc;
    },
    {}
  );
}

export function isConnectionNetworksEntryFresh(
  entry: ConnectionNetworksEntry,
  now = Date.now()
) {
  return now - entry.updatedAt <= CONNECTION_NETWORKS_MAX_AGE_MS;
}

// Incoming entries win over stored ones for the same domain. The oldest
// entries are dropped when the map outgrows the cap.
export function mergeConnectionNetworks(
  stored: ConnectionNetworks,
  incoming: ConnectionNetworks
): ConnectionNetworks {
  const merged = { ...stored, ...incoming };
  const entries = Object.entries(merged).sort(
    ([, a], [, b]) => b.updatedAt - a.updatedAt
  );
  return Object.fromEntries(entries.slice(0, MAX_STORED_CONNECTIONS));
}

// Picks the networks the popup offers for a site. Team networks are what the
// connected team enabled; site networks are what the dapp asked for in
// `wallet_connect`. Either may be unknown. The wallet list bounds everything,
// because Porto refuses to switch to a chain it was not configured with.
export function resolveSiteNetworkOptions(input: {
  walletChainIds: readonly number[];
  teamChainIds: readonly number[] | null;
  siteChainIds: readonly number[] | null;
}): { chainIds: number[]; source: SiteNetworkOptionsSource } {
  const { walletChainIds, teamChainIds, siteChainIds } = input;
  const teamKnown = teamChainIds !== null;
  const siteKnown = siteChainIds !== null;

  const chainIds = walletChainIds.filter(
    (chainId) =>
      (!teamKnown || teamChainIds.includes(chainId)) &&
      (!siteKnown || siteChainIds.includes(chainId))
  );

  if (teamKnown && siteKnown) return { chainIds, source: "team-and-site" };
  if (teamKnown) return { chainIds, source: "team" };
  if (siteKnown) return { chainIds, source: "site" };
  return { chainIds, source: "wallet" };
}

export function toSiteNetworkOption(chain: Chain): SiteNetworkOption {
  return { chainId: chain.id, name: chain.name };
}

// Porto's `wallet_connect` carries chain ids as hex on the wire; dapps calling
// the provider directly have been seen sending plain numbers too. Returns null
// for a missing or empty list: a dapp that names no chain has not said which
// it supports, so the list never carries an empty "supports nothing".
export function parseRequestedChainIds(params: unknown): number[] | null {
  if (!Array.isArray(params)) return null;
  const chainIds = (params[0] as { chainIds?: unknown } | undefined)?.chainIds;
  if (!Array.isArray(chainIds)) return null;
  const parsed = chainIds
    .map((value) => {
      if (isChainId(value)) return value;
      if (typeof value === "string" && /^0x[0-9a-f]+$/i.test(value))
        return Number.parseInt(value, 16);
      return null;
    })
    .filter((value): value is number => value !== null);
  return parsed.length > 0 ? parsed : null;
}

function isChainId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isDomain(value: string) {
  return (
    value.length > 0 &&
    value.length <= MAX_DOMAIN_LENGTH &&
    /^[a-z0-9.-]+$/i.test(value)
  );
}
