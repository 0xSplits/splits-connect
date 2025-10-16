import { splitsImage } from "@/utils/image";
import { getHost, getName, getUUID } from "../../utils";
import { Dialog, Mode, Porto } from "porto";

export default defineContentScript({
  main() {
    const porto = Porto.create({
      announceProvider: {
        name: getName(import.meta.env.MODE),
        rdns: "org.splits.teams.connect",
        uuid: getUUID(import.meta.env.MODE),
        icon: splitsImage,
      },
      mode: Mode.dialog({
        host: `${getHost(import.meta.env.MODE)}/connect/`,
        renderer: Dialog.popup({
          size: {
            width: 450,
            height: 650,
          },
        }),
      }),
    });
    (window as any).ethereum = porto.provider;

    window.addEventListener("message", (event) => {
      if (event.data.event !== "trigger-reload") return;
      window.location.reload();
    });
  },

  // content script will run on all HTTPS sites and also on any page served from http://localhost
  matches: ["https://*/*", "http://localhost/*"],
  runAt: "document_end",
  // ensures the injected provider is visible to the site’s own JavaScript
  world: "MAIN",
});
