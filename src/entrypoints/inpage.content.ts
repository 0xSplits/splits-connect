import { splitsImage } from "@/utils/image";
import { Dialog, Mode, Porto } from "porto";

export default defineContentScript({
  main() {
    console.log(import.meta.env.VITE_HOST_URL);
    const porto = Porto.create({
      announceProvider: {
        name: "Splits Connect",
        rdns: "org.splits.teams.connect",
        uuid: "9a99c6cc-732e-4089-a0e0-f0366b641f60",
        icon: splitsImage,
      },
      mode: Mode.dialog({
        host: `${import.meta.env.VITE_HOST_URL}/connect/`,
        renderer: Dialog.popup(),
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
