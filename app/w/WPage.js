import { cookies } from "next/headers";
import { cloneElement, isValidElement } from "react";
import Logo from "@/components/Logo";
import baseHyperliquidVaults from "@/data/defi/hyperliquid";
import coinM from "@/fn/coinM";
import { alchemyNetworks, rpcs, sets, walletNotes } from "@/sets";
import BrowserWalletConnect from "./BrowserWalletConnect";
import Wallet from "./Wallet";
import WalletInfo from "./WalletInfo";
import WalletSettings from "./WalletSettings";
import { readOffAddrs, readOffChains, readOffCoinM } from "./chainActions";
import { favAddrCookie, getFavAddrKey, parseFavAddrs } from "./favAddrs";
import {
  alchemyMinUsdCookie,
  disabledChainsCookie,
  disabledCoinsCookie,
  disabledWalletsCookie,
  parseOptionalBool,
  parseOptionalNumber,
  parseDisabledChains,
  parseDisabledCoinM,
  parseDisabledWallets,
  parseSortingMode,
  showGasAutoCookie,
  sortingModeCookie,
  usdPriceQueryCookie,
  useAlchemyCookie,
} from "./walletSettingData";
import {
  defaultWalletType,
  getAlchemyWalletTokenCache,
  getHyperliquidWalletBalances,
  getWalletBalances,
  getSolanaWalletBalances,
  getWalletType,
  loadWalletEntries,
  listWalletFiles,
  readCustomCoinM,
} from "./walletData";

function getSelectedWallet(walletFile, walletFiles) {
  if (!walletFile) return "";
  if (walletFiles.includes(`${walletFile}/`)) return `${walletFile}/`;
  if (!walletFiles.includes(walletFile)) return "";

  return walletFile;
}

function getHyperliquidVaultCoin(entry = {}) {
  const address = String(entry.address || entry.vaultAddress || "").trim();
  const name = String(entry.name || "").trim();
  const paren = name.match(/\(([^)]{1,20})\)\s*$/)?.[1] || "";
  const clean = String(entry.coin || entry.symbol || paren || name)
    .trim()
    .replace(/\(([^)]{1,20})\)\s*$/, "$1")
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "");
  const cleanAddress = address.replace(/^0x/i, "");

  return clean || (cleanAddress
    ? `HL_${cleanAddress.slice(0, 3)}..${cleanAddress.slice(-3)}`
    : "HL_VAULT");
}

function getHyperliquidVaultCoinM() {
  return Object.fromEntries(
    (Array.isArray(baseHyperliquidVaults) ? baseHyperliquidVaults : [])
      .map((entry) => [getHyperliquidVaultCoin(entry), entry])
      .filter(([coin]) => coin),
  );
}

function getEvmTokenAddressKey(address = "") {
  const text = String(address || "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(text) ? text.toLowerCase() : "";
}

function dedupeCoinInfoMByAddress(coinInfoM = {}) {
  const seenAddressM = {};
  const result = {};

  for (const [coin, coinE] of Object.entries(coinInfoM || {})) {
    const addressKey = getEvmTokenAddressKey(coinE?.address);
    if (addressKey) {
      if (seenAddressM[addressKey]) continue;
      seenAddressM[addressKey] = coin;
    }

    result[coin] = coinE;
  }

  return result;
}

function hasWalletPrivateKey(name = "", walletType = defaultWalletType) {
  if (!name) return false;

  return walletType == "solana"
    ? !!process.env[`pk_sol_${name}`]
    : !!process.env[`pk_${name}`];
}

function getWalletPrivateKeyM(...entryGroups) {
  const walletNames = new Map();

  for (const group of entryGroups) {
    const walletType = Array.isArray(group)
      ? defaultWalletType
      : getWalletType(group?.walletType || group?.type);
    const entries = Array.isArray(group) ? group : group?.entries;

    for (const entry of entries || []) {
      if (!entry?.name) continue;

      const key = `${walletType}:${entry.name}`;
      walletNames.set(key, {
        name: entry.name,
        walletType,
      });
    }
  }

  return Object.fromEntries(
    [...walletNames].flatMap(([key, entry]) => {
      const hasKey = hasWalletPrivateKey(entry.name, entry.walletType);

      return [
        [key, hasKey],
        [entry.name, hasKey],
      ];
    }),
  );
}

function findWalletEntryByAddress(
  entries = [],
  walletType = defaultWalletType,
  address = "",
) {
  const key = getFavAddrKey(walletType, address);
  if (!key) return null;

  return (
    entries.find((entry) => getFavAddrKey(walletType, entry?.address) == key) ??
    null
  );
}

function getInitialClientCookieM(cookieStore) {
  return Object.fromEntries(
    cookieStore
      .getAll()
      .filter((entry) => String(entry.name || "").startsWith("w3_"))
      .map((entry) => [entry.name, entry.value]),
  );
}

function getFavWalletEntries(
  favAddrs = [],
  walletType = defaultWalletType,
  knownEntries = [],
) {
  const usedNames = new Set();

  return favAddrs
    .filter((fav) => fav.type == walletType)
    .map((fav, index) => {
      const cleanAddress = String(fav.address || "").trim();
      const knownEntry = findWalletEntryByAddress(
        knownEntries,
        walletType,
        cleanAddress,
      );
      const baseName =
        String(knownEntry?.name || fav.name || "").trim() ||
        `fav_${cleanAddress.slice(-6) || index + 1}`;
      let name = baseName;
      let i = 2;

      while (usedNames.has(name)) {
        name = `${baseName}_${i}`;
        i += 1;
      }
      usedNames.add(name);

      return {
        ...knownEntry,
        name,
        address: cleanAddress,
        source: knownEntry?.source || "",
        label: knownEntry?.label || name,
      };
    })
    .filter((entry) => entry.address);
}

async function WPage({
  walletFile = "",
  walletType = defaultWalletType,
  walletAddress = "",
  walletName = "",
  routeBase = "/w",
  afterWallet = null,
} = {}) {
  console.log("render");
  const requestedWalletType = getWalletType(walletType);
  const rawWalletAddress = Array.isArray(walletAddress)
    ? walletAddress[0] ?? ""
    : walletAddress;
  const rawWalletName = Array.isArray(walletName)
    ? walletName[0] ?? ""
    : walletName;
  const walletNameAddress =
    typeof rawWalletName == "string" && rawWalletName.startsWith("addr=")
      ? rawWalletName.slice(5).trim()
      : "";
  const selectedWalletAddress = rawWalletAddress || walletNameAddress;
  const selectedWalletName = walletNameAddress ? "" : rawWalletName;
  const evmRpcChains = Object.keys(coinM).filter((chain) => rpcs?.[chain]);
  const hyperliquidChain = "Hyperliquid";
  const availableChains = [...evmRpcChains, hyperliquidChain];
  const customCoinM = await readCustomCoinM(availableChains);
  const availableCoinM = Object.fromEntries(
    availableChains.map((chain) => {
      const coinInfoM = dedupeCoinInfoMByAddress({
        ...(chain == hyperliquidChain ? getHyperliquidVaultCoinM() : coinM[chain] ?? {}),
        ...(customCoinM[chain] ?? {}),
      });

      return [chain, Object.keys(coinInfoM)];
    }),
  );
  const cookieStore = await cookies();
  const initialCookieM = getInitialClientCookieM(cookieStore);
  const favAddrs = parseFavAddrs(cookieStore.get(favAddrCookie)?.value);
  const disabledChains = parseDisabledChains(
    cookieStore.get(disabledChainsCookie)?.value,
    availableChains,
  );
  const offChains = await readOffChains(availableChains);
  const disabledCoinM = parseDisabledCoinM(
    cookieStore.get(disabledCoinsCookie)?.value,
    availableCoinM,
  );
  const offCoinM = await readOffCoinM(availableCoinM);
  const disabledWallets = parseDisabledWallets(
    cookieStore.get(disabledWalletsCookie)?.value,
  );
  const offAddrs = await readOffAddrs();
  const useAlchemyCookieValue = parseOptionalBool(
    cookieStore.get(useAlchemyCookie)?.value,
  );
  const defaultUseAlchemy = Number(sets?.useAlchemy) == 1;
  const useAlchemy =
    useAlchemyCookieValue === null ? defaultUseAlchemy : useAlchemyCookieValue;
  const rawDefaultAlchemyMinUsd = Number(sets?.alchemyMinUsd ?? 0.01);
  const defaultAlchemyMinUsd = Number.isFinite(rawDefaultAlchemyMinUsd)
    ? Math.max(0, rawDefaultAlchemyMinUsd)
    : 0.01;
  const alchemyMinUsdCookieValue = parseOptionalNumber(
    cookieStore.get(alchemyMinUsdCookie)?.value,
  );
  const alchemyMinUsd =
    alchemyMinUsdCookieValue === null
      ? defaultAlchemyMinUsd
      : Math.max(0, alchemyMinUsdCookieValue);
  const defaultShowGasAuto = false;
  const showGasAutoCookieValue = parseOptionalBool(
    cookieStore.get(showGasAutoCookie)?.value,
  );
  const showGasAuto =
    showGasAutoCookieValue === null
      ? defaultShowGasAuto
      : showGasAutoCookieValue;
  const defaultUsdPriceQuery = false;
  const usdPriceQueryCookieValue = parseOptionalBool(
    cookieStore.get(usdPriceQueryCookie)?.value,
  );
  const usdPriceQuery =
    usdPriceQueryCookieValue === null
      ? defaultUsdPriceQuery
      : usdPriceQueryCookieValue;
  const defaultSortingMode = "cookie";
  const sortingMode =
    parseSortingMode(cookieStore.get(sortingModeCookie)?.value) ||
    defaultSortingMode;
  const disabledChainM = new Set([...disabledChains, ...offChains]);
  const selectedWalletType =
    requestedWalletType == "solana" && disabledChainM.has("Solana")
      ? defaultWalletType
      : requestedWalletType;
  const chains = evmRpcChains.filter(
    (chain) => chain != "Solana" && !disabledChainM.has(chain),
  );
  const includeHyperliquid =
    selectedWalletType != "solana" && !disabledChainM.has(hyperliquidChain);
  const walletTypeOptions = [
    ["evm", "EVM"],
    ...(!disabledChainM.has("Solana") ? [["solana", "Solana"]] : []),
  ];
  const customCoinChains =
    selectedWalletType == "solana"
      ? disabledChainM.has("Solana")
        ? []
        : ["Solana"]
      : [...chains, ...(includeHyperliquid ? [hyperliquidChain] : [])];
  const walletFilesM = {
    evm: await listWalletFiles("evm"),
    solana: await listWalletFiles("solana"),
  };
  const walletFiles = walletFilesM[selectedWalletType] ?? [];
  const allWalletEntries = await loadWalletEntries("", selectedWalletType);
  const selectedAddressWalletEntry = findWalletEntryByAddress(
    allWalletEntries,
    selectedWalletType,
    selectedWalletAddress,
  );
  const wantsAllWallets = walletFile == "all";
  const wantsFavWallets =
    !wantsAllWallets &&
    !walletFile &&
    !selectedWalletAddress &&
    !selectedWalletName;
  const selectedWallet = wantsAllWallets
    ? "all"
    : getSelectedWallet(walletFile, walletFiles);
  const walletNotFound =
    !!walletFile &&
    !wantsAllWallets &&
    !selectedWallet &&
    !selectedWalletAddress &&
    !selectedWalletName;
  const selectedWalletFile = wantsAllWallets
    ? ""
    : (selectedWallet || walletFile).replace(/\/+$/, "");
  const favWalletEntries = wantsFavWallets
    ? getFavWalletEntries(favAddrs, selectedWalletType, allWalletEntries)
    : null;
  const selectedAddressWalletEntries = selectedAddressWalletEntry
    ? [selectedAddressWalletEntry]
    : null;
  const walletEntryList = selectedAddressWalletEntries || favWalletEntries;
  const tradeWalletEntriesM = afterWallet
    ? {
        evm: await loadWalletEntries("", "evm"),
        solana: await loadWalletEntries("", "solana"),
      }
    : {};
  const walletEntries = await loadWalletEntries(
    selectedWalletFile,
    selectedWalletType,
    {
      walletAddress: selectedWalletAddress,
      walletName: selectedWalletName,
      walletEntryList,
    },
  );
  const walletPkM = getWalletPrivateKeyM(
    { type: selectedWalletType, entries: walletEntries },
    { type: "evm", entries: tradeWalletEntriesM.evm },
    { type: "solana", entries: tradeWalletEntriesM.solana },
    selectedWalletName
      ? {
          type: selectedWalletType,
          entries: [{ name: selectedWalletName, address: selectedWalletAddress }],
        }
      : null,
  );
  const alchemyTokenCacheChains =
    selectedWalletType == "solana"
      ? disabledChainM.has("Solana")
        ? []
        : ["Solana"]
      : chains;
  const alchemyTokenCache = await getAlchemyWalletTokenCache({
    chains: alchemyTokenCacheChains,
    walletFile: selectedWalletFile,
    walletType: selectedWalletType,
    walletAddress: selectedWalletAddress,
    walletName: selectedWalletName,
    walletEntryList,
    disabledWallets,
    disabledWalletNames: offAddrs,
    useAlchemy,
  }).catch(() => null);
  const data =
    selectedWalletType == "solana"
      ? disabledChainM.has("Solana")
        ? []
        : [
            await getSolanaWalletBalances({
              walletFile: selectedWalletFile,
              walletAddress: selectedWalletAddress,
              walletName: selectedWalletName,
              walletEntryList,
              customCoinM: customCoinM.Solana ?? {},
              disabledCoins: [
                ...(disabledCoinM.Solana ?? []),
                ...(offCoinM.Solana ?? []),
              ],
              disabledWallets,
              disabledWalletNames: offAddrs,
              useAlchemy,
              alchemyMinUsd,
              usdPriceQuery,
              alchemyTokenCache,
            }),
          ]
      : await Promise.all(
          [
            ...chains.map((chain) =>
              getWalletBalances({
                chain,
                walletFile: selectedWalletFile,
                walletType: selectedWalletType,
                walletAddress: selectedWalletAddress,
                walletName: selectedWalletName,
                walletEntryList,
                customCoinM: customCoinM[chain] ?? {},
                disabledCoins: [
                  ...(disabledCoinM[chain] ?? []),
                  ...(offCoinM[chain] ?? []),
                ],
                disabledWallets,
                disabledWalletNames: offAddrs,
                useAlchemy,
                alchemyMinUsd,
                usdPriceQuery,
                alchemyTokenCache,
              }),
            ),
            ...(includeHyperliquid
              ? [
                  getHyperliquidWalletBalances({
                    walletFile: selectedWalletFile,
                    walletType: selectedWalletType,
                    walletAddress: selectedWalletAddress,
                    walletName: selectedWalletName,
                    walletEntryList,
                    customCoinM: customCoinM[hyperliquidChain] ?? {},
                    disabledCoins: [
                      ...(disabledCoinM[hyperliquidChain] ?? []),
                      ...(offCoinM[hyperliquidChain] ?? []),
                    ],
                    disabledWallets,
                    disabledWalletNames: offAddrs,
                  }),
                ]
              : []),
          ],
        );
  const dataByChain = new Map(
    (Array.isArray(data) ? data : data ? [data] : []).map((chainE) => [
      chainE.chain,
      chainE,
    ]),
  );
  const alchemyChainM = Object.fromEntries(
    availableChains.map((chain) => [chain, Boolean(alchemyNetworks?.[chain])]),
  );
  const chainSourceM = Object.fromEntries(
    availableChains.map((chain) => {
      const loadedSource = dataByChain.get(chain)?.source;
      const source =
        loadedSource ||
        (chain == hyperliquidChain
          ? "api"
          : useAlchemy && alchemyChainM[chain]
            ? "alchemy"
            : "rpc");

      return [chain, source];
    }),
  );
  const tradeData = evmRpcChains
    .filter((chain) => !disabledChainM.has(chain))
    .map((chain) => {
      const loaded = dataByChain.get(chain);
      if (loaded) return loaded;

      const disabledCoins = new Set([
        ...(disabledCoinM[chain] ?? []),
        ...(offCoinM[chain] ?? []),
      ]);
      const coinInfoM = dedupeCoinInfoMByAddress({
        ...(coinM[chain] ?? {}),
        ...(customCoinM[chain] ?? {}),
      });
      const allCoins = Object.keys(coinInfoM).filter(
        (coin) => !disabledCoins.has(coin),
      );

      return { chain, coins: [], allCoins, coinInfoM, scanner: "", rows: [] };
    });

  return (
    <div>
      {console.log("return")}
      <div className="flex mb-1 walletTopRow">
        <Logo page={"wallet"} />
        <WalletInfo />
        <WalletSettings
          chains={availableChains}
          chainSourceM={chainSourceM}
          alchemyChainM={alchemyChainM}
          disabledChains={disabledChains}
          offChains={offChains}
          defaultUseAlchemy={defaultUseAlchemy}
          useAlchemy={useAlchemy}
          defaultAlchemyMinUsd={defaultAlchemyMinUsd}
          alchemyMinUsd={alchemyMinUsd}
          defaultShowGasAuto={defaultShowGasAuto}
          showGasAuto={showGasAuto}
          defaultUsdPriceQuery={defaultUsdPriceQuery}
          usdPriceQuery={usdPriceQuery}
          defaultSortingMode={defaultSortingMode}
          sortingMode={sortingMode}
        />
        <BrowserWalletConnect
          routeBase={routeBase}
          walletType={selectedWalletType}
          selectedAddress={selectedWalletAddress}
          walletEntries={allWalletEntries}
        />
      </div>
      <Wallet
        routeBase={routeBase}
        data={data}
        customCoinM={customCoinM}
        customCoinChains={customCoinChains}
        walletNotes={walletNotes}
        walletFiles={walletFiles}
        walletFilesM={walletFilesM}
        selectedAddress={selectedWalletAddress}
        selectedWallet={selectedWallet}
        selectedWalletNotFound={walletNotFound}
        requestedWallet={walletFile}
        selectedWalletName={selectedWalletName}
        walletEntries={walletEntries}
        disabledWallets={disabledWallets}
        offAddrs={offAddrs}
        disabledCoinM={disabledCoinM}
        offCoinM={offCoinM}
        walletTypeOptions={walletTypeOptions}
        walletType={selectedWalletType}
        useAlchemy={useAlchemy}
        alchemyMinUsd={alchemyMinUsd}
        usdPriceQuery={usdPriceQuery}
        initialCookieM={initialCookieM}
      />
      {isValidElement(afterWallet)
        ? cloneElement(afterWallet, {
            data: tradeData,
            walletData: data,
            walletEntries,
            walletEntriesM: tradeWalletEntriesM,
            walletPkM,
            customCoinM,
            disabledCoinM,
            offCoinM,
            disabledWallets,
            offAddrs,
            useAlchemy,
            alchemyMinUsd,
            usdPriceQuery,
            showGasAutoLabel: showGasAuto,
            walletFiles,
            walletFilesM,
            selectedAddress: selectedWalletAddress,
            selectedWallet,
            requestedWallet: walletFile,
            selectedWalletName,
            walletType: selectedWalletType,
            walletTypeOptions,
            initialCookieM,
          })
        : afterWallet}
    </div>
  );
}

export default WPage;
