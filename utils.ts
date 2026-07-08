import { v5 as uuid } from "uuid";
import { http } from "viem";

// The primary app origin. This is where the Porto Connect dialog is hosted, so
// it must be the origin the dialog actually loads on — no redirects in between,
// or Porto's postMessage handshake fails an origin check and the dialog renders
// blank. teams.splits.org now redirects here, so we point straight at app.
export const getHost = (mode: string) => {
  switch (mode) {
    case "production":
      return "https://app.splits.org";
    case "dev":
      return "http://localhost:3001";
    default:
      return `https://app.${mode}.splits.org`;
  }
};

// Legacy origin (teams.splits.org) kept in the trusted set during the
// teams.splits.org → app.splits.org transition, so pages still served there can
// message the extension until teams.splits.org is fully retired.
const getLegacyHost = (mode: string) => {
  switch (mode) {
    case "production":
      return "https://teams.splits.org";
    case "dev":
      return null;
    default:
      return `https://teams.${mode}.splits.org`;
  }
};

export const getAllowedOrigins = (mode: string) => {
  const origins = [new URL(getHost(mode)).origin];
  const legacy = getLegacyHost(mode);
  if (legacy) origins.push(new URL(legacy).origin);
  return origins;
};

export const getRelay = (mode: string) => {
  switch (mode) {
    case "dev":
      return http("http://localhost:8080/public/v1/connect");
    default:
      return http(`https://server.${mode}.splits.org/public/v1/connect`);
  }
};

export const getName = (mode: string) =>
  `Splits${mode === "production" ? "" : `-${mode}`}`;

export const getUUID = (mode: string) => {
  const NAMESPACE = import.meta.env.WXT_NAMESPACE_UUID;
  return uuid(mode, NAMESPACE);
};
