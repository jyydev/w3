# W3

W3 is a personal wallet dashboard and trading workspace built with Next.js. It can view EVM and Solana wallet balances, organize wallet lists, add custom tokens, and run local-only trade tooling from the same interface.

## Features

- Wallet balance tables for EVM chains and Solana.
- Multi-wallet views with `favs`, `all`, folder-based wallet files, direct `?w=walletName`, and direct `?addr=ADDRESS` loading.
- Token metadata from project coin files plus custom coins added through the UI.
- Alchemy Portfolio support when enabled, with fallback to the normal RPC/token-list method.
- Price display using DefiLlama first, DexScreener fallback, and RPC exchange-rate fallback where supported.
- Browser wallet connection for EVM and Solana wallets.
- Trade workspace under `/t` with swap, send, and lending panels.
- Editor page for local project data during development, and browser `localStorage` data on deployed sites.

## Routes

- `/w` - wallet viewer, defaulting to favorite wallets.
- `/w/all` - all wallets.
- `/w/path/to/file-or-folder` - wallet file/folder selection.
- `/w?w=walletName` - filter by wallet name.
- `/w?addr=ADDRESS` - view one custom address.
- `/t` - wallet viewer plus trade panel.
- `/editor` - data editor.
- `/ref` - reference/help page.

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
data/editor/wallet/evm/*.txt
data/editor/wallet/solana/*.txt
data/editor/coins/*.json
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

## Private Keys

Private-key based trading is for local `npm run dev` only.

Do not commit private keys. Do not configure `pk_*` or `pk_sol_*` private keys in public deployments. Public/deployed usage should rely on connected browser wallets for signing.

Optional local-only private key env names:

```txt
pk_walletName=
pk_sol_walletName=
```

## Environment Variables

Copy `.env.example` to `.env.local` for local secrets.

Common variables:

```txt
login=
rpc_key_alchemy=
rpc_solana_alchemy1=
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

## Deployment Notes

- Vercel builds the app from GitHub.
- Runtime project-file writes are disabled on Vercel.
- Use browser `localStorage` mode for deployed editable data.
- Put production-safe API keys in Vercel environment variables only.
- Do not put private wallet keys in Vercel unless you are intentionally running a private deployment.

## Scripts

```bash
npm run dev
npm run build
npm run start
```
