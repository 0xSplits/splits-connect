# Splits Connect Extension

A browser extension to connect Splits to apps.

## Documentation

The extension is built using [wxt](https://wxt.dev/) and [porto](https://porto.sh/). It uses [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) to announce itself to apps.

## Development

Installs dependencies and launches a new chrome instances with the extension installed and ready to use.

note: Make sure to update the `.env` file with the correct values as seen in the `.env.sample` file.

```bash
pnpm install
pnpm dev
```

You can use the following modes when building the extension.

1. dev - `http://localhost:3001`
2. production - `https://app.splits.org`
3. staging - `https://app.staging.splits.org`
4. testing - `https://app.testing.splits.org`

## Adding a network

Every network the Splits app lists must work here. Porto only switches to chains it was created with: `Chains.all` from `@splits/porto`, plus the extra chains in `src/entrypoints/content.ts`.

1. If the chain isn't in `Chains.all`, add its viem chain to `chains` in `src/entrypoints/content.ts`. MegaETH is the precedent (#18).
2. If viem's chain has no RPC URLs, give it one there: `{ ...chain, rpcUrls: { default: { http: ['<public rpc>'] } } }`. Porto's default transport is `http()`, which throws `UrlRequiredError` for a chain without a URL.
3. [Release](#release). Chrome Web Store review can take days, so release early. Releasing before the Splits app lists the network is harmless: the popup only offers networks the team has turned on.

The Splits app's `/connect/` dialog builds its chains from the server's network registry, so it needs no change.

## Release

Firstly, update the version in the `package.json` file.

To release the extension, you can use the following command.

```bash
pnpm release
```

This zips all environments and publishes a GitHub release (tag `v<version>`) with the zips attached as assets. For reference, see the [releases page](https://github.com/0xSplits/splits-connect/releases).

Take the production build and submit it to the Chrome Web Store under the `chrome-web-store@splits.org` publisher.
