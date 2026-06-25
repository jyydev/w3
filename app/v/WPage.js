import { cookies } from "next/headers";
import Logo from "@/components/Logo";
import coinM from "@/fn/coinM";
import { rpcs } from "@/sets";
import Wallet from "./Wallet";
import WalletInfo from "./WalletInfo";
import WalletSettings from "./WalletSettings";
import { readOffAddrs, readOffChains, readOffCoinM } from "./chainActions";
import {
  disabledChainsCookie,
  disabledCoinsCookie,
  disabledWalletsCookie,
  parseDisabledChains,
  parseDisabledCoinM,
  parseDisabledWallets,
} from "./walletSettingData";
import {
  defaultWalletType,
  getWalletBalances,
  getSolanaWalletBalances,
  getWalletType,
  loadWalletEntries,
  listWalletFiles,
} from "./walletData";

function getSelectedWallet(walletFile, walletFiles) {
  if (!walletFile) return "";
  if (walletFiles.includes(`${walletFile}/`)) return `${walletFile}/`;
  if (!walletFiles.includes(walletFile)) return "";

  return walletFile;
}

async function WPage({
  walletFile = "",
  walletType = defaultWalletType,
  walletAddress = "",
  walletName = "",
} = {}) {
  console.log("render");
  const requestedWalletType = getWalletType(walletType);
  const selectedWalletAddress = Array.isArray(walletAddress)
    ? walletAddress[0] ?? ""
    : walletAddress;
  const selectedWalletName = Array.isArray(walletName)
    ? walletName[0] ?? ""
    : walletName;
  const availableChains = Object.keys(coinM).filter((chain) => rpcs?.[chain]);
  const availableCoinM = Object.fromEntries(
    Object.entries(coinM).map(([chain, coins]) => [chain, Object.keys(coins)]),
  );
  const cookieStore = await cookies();
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
  const selectedWallet = getSelectedWallet(walletFile, walletFiles);
  const selectedWalletFile = selectedWallet.replace(/\/+$/, "");
  const walletEntries = await loadWalletEntries(
    selectedWalletFile,
    selectedWalletType,
    {
      walletAddress: selectedWalletAddress,
      walletName: selectedWalletName,
    },
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
              disabledCoins: [
                ...(disabledCoinM.Solana ?? []),
                ...(offCoinM.Solana ?? []),
              ],
              disabledWallets,
              disabledWalletNames: offAddrs,
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
              disabledCoins: [
                ...(disabledCoinM[chain] ?? []),
                ...(offCoinM[chain] ?? []),
              ],
              disabledWallets,
              disabledWalletNames: offAddrs,
            }),
          ),
        );

  return (
    <div>
      {console.log("return")}
      <div className="flex mb-1">
        <Logo page={"wallet"} />
        <WalletInfo />
        <WalletSettings
          chains={availableChains}
          disabledChains={disabledChains}
          offChains={offChains}
        />
      </div>
      <Wallet
        data={data}
        customCoinChains={customCoinChains}
        walletFiles={walletFiles}
        walletFilesM={walletFilesM}
        selectedAddress={selectedWalletAddress}
        selectedWallet={selectedWallet}
        selectedWalletName={selectedWalletName}
        walletEntries={walletEntries}
        disabledWallets={disabledWallets}
        offAddrs={offAddrs}
        disabledCoinM={disabledCoinM}
        offCoinM={offCoinM}
        walletTypeOptions={walletTypeOptions}
        walletType={selectedWalletType}
      />
    </div>
  );
}

export default WPage;
