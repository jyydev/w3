import "ygb/nx";
import axios from "axios";
import fp from "floatp";
import { aaveV3GraphMarketM } from "./index";

async function postAaveGraph(query) {
  const response = await axios.post("https://api.v3.aave.com/graphql", {
    query,
    variables: {},
  });
  if (!response?.data?.data) {
    const message = (response?.data?.errors || [])
      .map((error) => error?.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(message || "Aave GraphQL request failed");
  }

  return response.data.data;
}

async function getChainCoins(chainId, address) {
  const query = `{
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
            actionKey
            rewardTokenAddress
            rewardTokenSymbol
            customMessage
            customForumLink
            selfApr {formatted}
          }
          ... on AaveSupplyIncentive {
            extraSupplyApr {formatted}
            rewardTokenAddress
            rewardTokenSymbol
          }
          ... on MerklSupplyIncentive {
            id
            startDate
            endDate
            extraSupplyApr {formatted}
            payoutToken {symbol name address}
            criteria {id text userPassed}
            userEligible
            description
            customMessage
            customForumLink
            customClaimMessage
          }
          ... on SupplyPointsIncentive {
            id
            name
            startDate
            endDate
            multiplier
            kind
            dailyPoints
            pointsPerThousandUsd
            criteria {id text userPassed}
            userEligible
            description
            customMessage
            customForumLink
            program {name externalUrl}
          }
        }
      }
    }
  }`;
  const result = await postAaveGraph(query);

  return result.market;
}

function getAaveLendingChains(chainsParam = "") {
  const requestedChains = String(chainsParam || "")
    .split(",")
    .map((chain) => chain.trim())
    .filter((chain) => aaveV3GraphMarketM[chain]);

  return structuredClone(
    requestedChains.length
      ? Object.fromEntries(
          requestedChains.map((chain) => [
            chain,
            aaveV3GraphMarketM[chain],
          ]),
        )
      : aaveV3GraphMarketM,
  );
}

function getCoinPriority(coin = "") {
  const priority = { USDT: 1, USDC: 2, BTC: 41, BNB: 42 };

  return (
    priority[coin] ||
    (/^[^-]*USD[^-]*$/.test(coin)
      ? 11
      : /^.*DAI.*$/.test(coin)
        ? 12
        : /^.*EUR.*$/.test(coin)
          ? 21
          : /^.*ETH.*$/.test(coin)
            ? 31
            : /^.*BTC.*$/.test(coin)
              ? 41
              : 99)
  );
}

export async function loadAaveLendingView(chainsParam = "") {
  const chains = getAaveLendingChains(chainsParam);
  const chainResults = await Promise.all(
    Object.values(chains).map((entry) =>
      getChainCoins(entry.id, entry.address),
    ),
  );
  const coins = [];
  let coinsM = Object.fromEntries(
    chainResults.map((chain) => [
      chain.name.replace("AaveV3", ""),
      Object.fromEntries(
        chain.reserves.map((entry) => {
          const coin = entry.underlyingToken.symbol;
          if (!coins.includes(coin)) coins.push(coin);

          return [
            coin,
            {
              ...entry,
              supply: { apy: entry.supplyInfo.apy.formatted },
            },
          ];
        }),
      ),
    ]),
  );
  coinsM = fp(coinsM);
  coins.sort((a, b) => getCoinPriority(a) - getCoinPriority(b));

  return { chains, coins, coinsM };
}
