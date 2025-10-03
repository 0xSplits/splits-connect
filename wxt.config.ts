import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: () => ({
    name: "Splits Connect",
    permissions: ["contextMenus", "tabs", "storage", "scripting"],
    host_permissions: ["*"],
    action: { default_title: "Splits Connect" },
    // Allow your domain to message the extension
    externally_connectable: {
      matches: [`${import.meta.env.VITE_HOST_URL}/*`],
    },
  }),
  vite: () => ({
    build: {
      rollupOptions: {
        external: ["wxt/utils/storage"],
      },
    },
  }),
  srcDir: "src",
});
