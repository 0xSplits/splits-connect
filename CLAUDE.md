# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Splits Connect — a browser extension (built with [WXT](https://wxt.dev/)) that injects an EIP-1193/EIP-6963 Ethereum provider into every page and routes wallet requests through [Porto](https://porto.sh/) (`@splits/porto`) to the Splits app. There is no test suite; `pnpm compile` (tsc --noEmit) is the only check.

## Commands

```bash
pnpm install          # also runs `wxt prepare` (generates .wxt/tsconfig.json — needed before compile works)
pnpm dev              # launches Chrome with the extension, dev mode (app at http://localhost:3001)
pnpm compile          # typecheck (tsc --noEmit)
pnpm build            # production build
pnpm zip:all          # release zips for all four modes into .output/
```

Requires a `.env` (see `.env.sample`) providing `WXT_NAMESPACE_UUID`.

## Modes

Everything is parameterized by WXT build mode: `dev`, `production`, `staging`, `testing`. Root `utils.ts` is the single source for mode → host / relay / allowed-origins / extension-name mapping (dev → `http://localhost:3001`, production → `https://app.splits.org`, else `https://app.<mode>.splits.org`). Code reads the mode via `import.meta.env.MODE`. Release: bump `version` in `package.json`, `pnpm zip:all`, upload to GitHub releases; production build goes to the Chrome Web Store.

## Architecture

Three scripts communicate via `window.postMessage`, with message shapes and type guards defined in `src/utils/bridge.ts`:

1. **`src/entrypoints/inpage.content.ts`** — runs in the page's MAIN world at `document_start`. Instantiates `SplitsEthereumProvider` (`src/providers/splits-ethereum-provider.ts`), assigns it to `window.ethereum`/`window.splitsEthereum`, and announces via EIP-6963. The provider serializes each `request()` into a bridge message; requests queue until the content bridge answers the ready handshake (polled every 250ms).

2. **`src/entrypoints/content.ts`** — isolated-world content script hosting `ContentBridge`. Lazily creates the Porto instance (dialog popup hosted at `<host>/connect/`, relay from `getRelay`) on first request, forwards provider events back to the page, and relays session-info messages (only on the Splits origin) to the background.

3. **`src/entrypoints/background.ts`** — registers two message bridges plus a context menu:
   - `RpcStorageBridge` answers `onMessageExternal` requests from the Splits app (origins restricted via `externally_connectable` in `wxt.config.ts` + a sender-origin re-check) to fetch offloaded RPC payloads.
   - `SessionInfoBridge` persists sanitized session info to `browser.storage.local` for the popup (`src/entrypoints/popup/`), which renders it read-only.

**Large RPC offload** (`src/utils/rpc-offload.ts` + `rpc-storage.ts`): oversized `eth_sendTransaction`/`wallet_sendCalls` data fields are stored in `browser.storage.local` under a token and replaced with a `0xsplitsconnectkey:<extensionId>:<token>:<hash>` placeholder before hitting Porto; the Splits app fetches the real payload back through `RpcStorageBridge` (single-use, 5-minute TTL). This keeps huge calldata out of postMessage/URL limits.

**Origin trust**: the Porto dialog host must be the exact origin the dialog loads on (no redirects, or the postMessage handshake fails and the dialog renders blank — see the comment on `getHost`). `teams.splits.org` is a legacy origin kept in the allowed set during the migration to `app.splits.org`.
