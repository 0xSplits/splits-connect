import { defineConfig } from "wxt";
import { getHost, getName } from "./utils";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: ({ mode }) => {
    return {
      name: getName(mode),
      permissions: ["contextMenus", "tabs", "storage", "scripting"],
      host_permissions: ["https://*/*"],
      description: "An extension to connect any app to Splits Teams.",
      action: {
        default_title: getName(mode),
      },
      // Allow your domain to message the extension
      externally_connectable: {
        matches: [`${getHost(mode)}/*`],
      },
    };
  },
  vite: () => ({
    build: {
      rollupOptions: {
        external: ["wxt/utils/storage"],
      },
    },
  }),
  srcDir: "src",
});
