# Splits Connect Extension

A browser extension to connect Splits Teams to apps.

## Documentation

The extension is built using [wxt](https://wxt.dev/) and [porto](https://porto.sh/). It uses [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) to announce itself to apps.

## Development

Installs dependencies and launches a new chrome instances with the extension installed and ready to use.

```bash
pnpm install
pnpm dev --mode dev
```

You can use the following modes when building the extension.

1. `dev` - `http://localhost:3001`
2. `production` - `https://teams.splits.org`
3. `staging` - `https://teams.staging.splits.org`
4. `testing` - `https://teams.testing.splits.org`
