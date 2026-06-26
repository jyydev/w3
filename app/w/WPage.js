import { cookies } from "next/headers";
import { cloneElement, isValidElement } from "react";
import Logo from "@/components/Logo";
import coinM from "@/fn/coinM";
import { rpcs, sets } from "@/sets";
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
  useAlchemyCookie,
} from "./walletSettingData";
import {
  defaultWalletType,
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
  const availableChains = Object.keys(coinM).filter((chain) => rpcs?.[chain]);
  const customCoinM = await readCustomCoinM(availableChains);
  const availableCoinM = Object.fromEntries(
    Object.entries(coinM).map(([chain, coins]) => [
      chain,
      Object.keys({ ...coins, ...(customCoinM[chain] ?? {}) }),
    ]),
  );
  const cookieStore = await cookies();
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
  const disabledChainM = new Set([...disabledChains, ...offChains]);
  const selectedWalletType =
    requestedWalletType == "solana" && disabledChainM.has("Solana")
      ? defaultWalletType
      : requestedWalletType;
  const chains = availableChains.filter(
    (chain) => chain != "Solana" && !disabledChainM.has(chain),
  );
  const walletTypeOptions = [
    ["evm", "EVM"],
    ...(!disabledChainM.has("Solana") ? [["solana", "Solana"]] : []),
  ];
  const customCoinChains =
    selectedWalletType == "solana"
      ? disabledChainM.has("Solana")
        ? []
        : ["Solana"]
      : chains;
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
            }),
          ]
      : await Promise.all(
          chains.map((chain) =>
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
            }),
          ),
        );
  const dataByChain = new Map(
    (Array.isArray(data) ? data : data ? [data] : []).map((chainE) => [
      chainE.chain,
      chainE,
    ]),
  );
  const tradeData = availableChains
    .filter((chain) => !disabledChainM.has(chain))
    .map((chain) => {
      const loaded = dataByChain.get(chain);
      if (loaded) return loaded;

      const disabledCoins = new Set([
        ...(disabledCoinM[chain] ?? []),
        ...(offCoinM[chain] ?? []),
      ]);
      const coinInfoM = { ...(coinM[chain] ?? {}), ...(customCoinM[chain] ?? {}) };
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
          disabledChains={disabledChains}
          offChains={offChains}
          defaultUseAlchemy={defaultUseAlchemy}
          useAlchemy={useAlchemy}
          defaultAlchemyMinUsd={defaultAlchemyMinUsd}
          alchemyMinUsd={alchemyMinUsd}
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
            walletFiles,
            walletFilesM,
            selectedAddress: selectedWalletAddress,
            selectedWallet,
            requestedWallet: walletFile,
            selectedWalletName,
            walletType: selectedWalletType,
            walletTypeOptions,
          })
        : afterWallet}
    </div>
  );
}

export default WPage;
