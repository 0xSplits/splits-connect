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

export const getRelay = (mode: string) => {
  switch (mode) {
    case "dev":
      return http("http://localhost:8080");
    default:
      return http(`https://server.${mode}.splits.org/public/connect`);
  }
};

export const getName = (mode: string) =>
  `Splits${mode === "production" ? "" : `-${mode}`}`;

export const getUUID = (mode: string) => {
  const NAMESPACE = import.meta.env.WXT_NAMESPACE_UUID;
  return uuid(mode, NAMESPACE);
};
