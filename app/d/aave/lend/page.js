import "ygb/nx";
import axios from "axios";
import Logo from "@/components/Logo";
import chainsR from "../data";
import Client from "./Client";

async function post(query, variables = {}) {
  let r = await axios.post("https://api.v3.aave.com/graphql", {
    query,
    variables,
  });
  if (!r?.data?.data) E(r?.data);
  return r?.data?.data;
}

async function App({ searchParams }) {
  console.log("render");
  searchParams = await searchParams;
  let chains = structuredClone(chainsR); //chainging imported object will be cached even browser refresh
  if (searchParams?.chains) {
    let onlyChains = searchParams.chains?.split(",");
    chains = Object.fromEntries(onlyChains.map((k) => [k, chains[k]]));
  }
  let ck = await getNxCookies();
  let omitChains = ck.av_omitChains?.split(" ");
  async function getChainCoins(chainId, address) {
    let query = `{
      market(
        request: {
          address: "${address}"
          chainId: ${chainId}
        }
      ) {
        name
        reserves {
          underlyingToken {symbol name}
          supplyInfo {
            apy {formatted}
          }
                                incentives {
            __typename
            ... on MeritSupplyIncentive {
              extraSupplyApr {formatted}
              claimLink
            }
            ... on AaveSupplyIncentive {
              extraSupplyApr {formatted}
              rewardTokenSymbol
            }
          }

        }

      }
    }`;
    let R = await post(query);
    let r = R.market;
    return r;
  }

  let promises = [];
  for (let chain in chains) {
    if (omitChains?.includes(chain)) {
      delete chains[chain];
      continue;
    }
    let e = chains[chain];
    promises.push(getChainCoins(e.id, e.address));
  }
  let [coinsR] = await Promise.all([Promise.all(promises)]);
  let coins = [];
  let coinsM = Object.fromEntries(
    coinsR.map((chain) => [
      chain.name.replace("AaveV3", ""),
      Object.fromEntries(
        chain.reserves.map((e) => {
          let coin = e.underlyingToken.symbol;
          if (!coins.includes(coin)) coins.push(coin);
          return [coin, { ...e, supply: { apy: e.supplyInfo.apy.formatted } }];
        }),
      ),
    ]),
  );
  coinsM = fp(coinsM); //{Ethereum:{USDT:{supply:{apy},},},}

  /*sort coins*/ {
    let priority = { USDT: 1, USDC: 2, BTC: 41, BNB: 42 };
    coins.sort((a, b) => {
      const getPriority = (c) =>
        priority[c] ||
        (/^[^-]*USD[^-]*$/.test(c)
          ? 11
          : /^.*DAI.*$/.test(c)
            ? 12
            : /^.*EUR.*$/.test(c)
              ? 21
              : /^.*ETH.*$/.test(c)
                ? 31
                : /^.*BTC.*$/.test(c)
                  ? 41
                  : 99);
      return getPriority(a) - getPriority(b);
    }); //match USD but not PT-USDe-25SEP2025 (with dash)
  }

  return (
    <div>
      {console.log("return")}
      <Logo {...{ page: "home" }} />
      <Client {...{ chains, coins, coinsM, ck }} />
    </div>
  );
}

export default App;
