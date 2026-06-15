import { v5 as uuid } from "uuid";
import { http } from "viem";

export const getHost = (mode: string) => {
  switch (mode) {
    case "production":
      return "https://teams.splits.org";
    case "dev":
      return "http://localhost:3001";
    default:
      return `https://teams.${mode}.splits.org`;
  }
};

export const getAllowedOrigins = (mode: string) => {
  const origins = [new URL(getHost(mode)).origin];
  if (mode === "production") origins.push("https://app.splits.org");
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
