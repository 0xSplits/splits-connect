import { splitsImage } from "@/utils/image";
import { getName, getUUID } from "../../utils";

export const PROVIDER_RDNS = "org.splits.teams.connect";

export type ProviderIcon = `data:image/${string}`;

export type ProviderInfo = {
  icon: ProviderIcon;
  name: string;
  rdns: string;
  uuid: string;
};

export function getProviderInfo(mode: string): ProviderInfo {
  return {
    icon: splitsImage,
    name: getName(mode),
    rdns: PROVIDER_RDNS,
    uuid: getUUID(mode),
  };
}
