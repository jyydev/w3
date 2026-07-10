# W3

W3 is a personal wallet dashboard and trading workspace built with Next.js. It can view EVM and Solana wallet balances, organize wallet lists, add custom tokens, and run local-only trade tooling from the same interface.

## Features

- Wallet balance tables for EVM chains, Solana, and Hyperliquid.
- Multi-wallet views with `favs`, `all`, folder-based wallet files, direct `?w=walletName`, and direct `?addr=ADDRESS` loading.
- Token metadata from project coin files plus custom coins added through the UI.
- Hyperliquid vault metadata from project defi files plus custom vaults added through the UI.
- Alchemy Portfolio support when enabled, with fallback to the normal RPC/token-list method.
- Price display using DefiLlama first, DexScreener fallback, and RPC exchange-rate fallback where supported.
- Optional stablecoin USD price querying from the settings card.
- Browser wallet connection for EVM and Solana wallets, with the connected address refreshed from the extension on page load.
- Trade workspace under `/t` with Swap, Send, Lend, and Yield panes.
- Loop-wallet execution for supported Trade actions after user confirmation.
- Simple app login using the app-specific `w3_login` cookie.
- Editor page for local project data during development, and browser `localStorage` data on deployed sites.

## Routes

- `/w` - wallet viewer, defaulting to favorite wallets.
- `/w/all` - all wallets.
- `/w/path/to/file-or-folder` - wallet file/folder selection.
- `/w?w=walletName` - filter by wallet name.
- `/w?addr=ADDRESS` - view one custom address.
- `/t` - wallet viewer plus trade panel.
- `/t/all` - trade panel with all wallets.
- `/editor` - data editor.
- `/ref` - reference/help page.

## Data Formats

Wallet files under `data/editor/wallets` use JSON arrays:

```json
[
  {
    "wallet": "gtY",
    "address": "0x...",
    "ref": "optional note"
  }
]
```

Coin files under `data/coins` and `data/editor/coins` use array entries:

```js
[
  {
    coin: "USDC",
    address: "0x...",
    decimals: 6,
    name: "USD Coin",
    type: "stable",
    ref: "optional note",
  },
];
```

Common coin `type` values are `stable`, `lend`, `yield`, and `vault`.

## Local Development

Install dependencies:

```bash
npm install
```

Run the local dev server:

```bash
npm run dev
```

The dev server runs on port `6`:

```txt
http://localhost:6
```

Local development reads and writes project files under:

```txt
data/editor/
```

Examples:

```txt
data/editor/wallets/evm/*.json
data/editor/wallets/solana/*.json
data/editor/coins/*.json
data/editor/defi/*.json
data/editor/cookie/*.txt
```

Local/private config belongs in `set.js`, `.env`, or `.env.local`. These files should not be committed.

## Deployed Mode

On Vercel or any normal public domain, the app cannot write to project files. In that mode, editable wallet/coin/cookie data is stored in the browser's `localStorage`.

This means:

- Data is local to the current browser profile and domain.
- Data is not shared across devices automatically.
- Clearing browser site data can remove local wallets and custom coins.
- File/folder style paths are emulated inside `localStorage` so deployed behavior matches local development as closely as possible.

## Trade Workspace

The `/t` workspace shares the wallet table with `/w` and adds trade panes:

- Swap - Relay, Jumper, Across.to, Uniswap, and Jupiter where supported.
- Send - wallet-to-wallet transfers.
- Lend - Aave, Venus, Morpho, and Jupiter lending markets.
- Yield - Spark, Venus Flux, and Hyperliquid flows.

Pane, protocol, chain, coin, approval, and visibility selections are remembered in cookies. Focusing or changing a Trade chain also opens the matching Wallet chain.

## Private Keys

Private-key based trading is for local `npm run dev` only.

Do not commit private keys. Do not configure `pk_raw_*`, or `pk_sol_raw_*` private keys in public deployments. Public/deployed usage should rely on connected browser wallets for signing.

Optional local-only private key env names:

```txt
pk_raw_walletName=
pk_sol_raw_walletName=
```

If `onWhitelist` is enabled in private local settings, private-key sends and bridge recipient addresses are restricted to configured whitelist addresses. Connected browser-wallet signing is not restricted by that local private-key whitelist.

## Environment Variables

Use `/ref/env` in the app for the full environment-variable reference.
Local secrets should go in `.env.local`.

Common variables:

```txt
login=
rpc_key_alchemy=
RELAY_API_KEY=
ACROSS_API_KEY=
ACROSS_INTEGRATOR_ID=
```

Never commit real `.env`, `.env.local`, private RPC keys, login values, or wallet private keys.

## Settings

Admin-style defaults are configured in:

```txt
sets.js
```

Local personal overrides can be placed in:

```txt
set.js
```

`set.js` is intended for private/local settings and should stay out of GitHub.

The logo settings card includes app toggles such as Alchemy usage, Alchemy minimum USD filter, gas auto label display, optional USD price querying, clear cookies, and clear editable data.

## Deployment Notes

- Vercel builds the app from GitHub.
- Runtime project-file writes are disabled on Vercel.
- Use browser `localStorage` mode for deployed editable data.
- Put production-safe API keys in Vercel environment variables only.
- Do not put private wallet keys in Vercel unless you are intentionally running a private deployment.
- Public deployments should rely on connected browser wallets for signing.

## Scripts

```bash
npm run dev
npm run build
npm run start
```
