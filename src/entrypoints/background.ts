export default defineBackground(() => {
  ContextMenu.create();
});

namespace ContextMenu {
  export function create() {
    browser.contextMenus.create({
      contexts: ["action"],
      id: "app",
      title: "Splits Teams",
    });

    browser.contextMenus.onClicked.addListener(async (info) => {
      if (info.menuItemId === "app")
        browser.tabs.create({
          url: "https://teams.splits.org",
        });
    });
  }
}
