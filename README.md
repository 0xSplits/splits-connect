# Splits Connect Extension

A browser extension to connect Splits Teams to apps.

## Documentation

The extension is built using the [wxt](https://wxt.dev/) and [porto](https://porto.sh/). It uses [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) to announce itself to apps.

## Development

Installs dependencies and launches a new chrome instances with the extension installed and ready to use.

```bash
pnpm install
pnpm dev
```

When running locally the extension points to `localhost:3000/connect` by default.
