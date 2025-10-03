import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "Splits Connect",
    permissions: ["contextMenus", "tabs", "storage", "scripting"],
    host_permissions: ["*"],
    action: { default_title: "Splits Connect" },
    // Allow your domain to message the extension
    externally_connectable: {
      matches: ["https://teams.splits.org/*"],
    },
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
