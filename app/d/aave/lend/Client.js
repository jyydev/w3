"use client";
import "ygb/react";
import { pc } from "@/fn/basic";
import Toggle from "@/components/Toggle";
import Link from "next/link";

const Chain = ({ chains, coins, coinsM, ck }) => {
  let ckPre = "av_";
  let chainNames = Object.keys(chains);
  const [show, setShow] = useState(false);
  // if (!show) coins = coins.filter((coin) => !/PT-/.test(coin)); //filter PT-sUSDE-25SEP2025
  let showCoins = ck[ckPre + "showCoins"]?.split(" ") ?? [];
  let hideCoins = ck[ckPre + "hideCoins"]?.split(" ") ?? [];
  if (!show)
    coins = coins.filter(
      (coin) =>
        (/(USD|DAI|ETH|BTC|BNB|EUR)/.test(coin) ||
          /*if showCoins!=[' ']|[]*/ (showCoins.length > 0 &&
            !showCoins.some((coin) => coin.trim() == "") &&
            new RegExp(showCoins.join("|")).test(coin))) &&
        !/^PT-/.test(coin) &&
        !(
          hideCoins.length > 0 &&
          !hideCoins.some((coin) => coin.trim() == "") &&
          new RegExp(hideCoins.join("|")).test(coin)
        ), //need all false -> !false -> true to show
    ); //filter PT-sUSDE-25SEP2025
  return (
    <table>
      <caption>chains</caption>
      <thead>
        <tr>
          <th className="stickyA">
            <Toggle {...{ show, setShow }} />
          </th>
          {coins.map((coin) => (
            <th key={uid()}>{coin}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {chainNames.map((chain) => {
          return (
            <tr key={uid()}>
              <td className="stickyL">
                <Link href={`/d/aave/lend?chains=${chain}`}>{chain}</Link>
              </td>
              {coins.map((coin) => {
                let coinE = coinsM[chain][coin];
                let bonuses = coinE?.incentives;
                return (
                  <td key={uid()}>
                    {coinsM[chain][coin]?.supply?.apy && (
                      <div>
                        {show && <span className="gray">lend:</span>}
                        {coinsM[chain][coin]?.supply?.apy}
                        {bonuses.length > 0 &&
                          bonuses.map((e) => {
                            return (
                              <span key={uid()}>
                                {[
                                  "MeritSupplyIncentive",
                                  "AaveSupplyIncentive",
                                ].includes(e.__typename) ? (
                                  <>
                                    <span className="gray">+</span>
                                    <span>
                                      {e.claimLink && (
                                        <Link
                                          target="_blank"
                                          href={e.claimLink}
                                          title={e.__typename}
                                        >
                                          {e.extraSupplyApr.formatted}
                                        </Link>
                                      )}
                                      {e.rewardTokenSymbol && (
                                        <span
                                          className="info"
                                          title={`${e.__typename} in ${e.rewardTokenSymbol}`}
                                        >
                                          {e.extraSupplyApr.formatted}
                                        </span>
                                      )}
                                    </span>
                                  </>
                                ) : /*skip: borrow*/ [
                                    "MeritBorrowIncentive",
                                    "AaveBorrowIncentive",
                                  ].includes(e.__typename) ? (
                                  <></>
                                ) : (
                                  /*new, add code*/ <span className="red">
                                    {e.__typename}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
export default Chain;
