import Link from "next/link";
import { Fragment } from "react";
import { ckPrefix } from "@/sets";
import NavbarLinkMenu from "./NavbarLinkMenu";
import NavbarWalletMenu from "./NavbarWalletMenu";
import NavbarHomeLink from "./NavbarHomeLink";
import SortableNavbarItems from "./SortableNavbarItems";
import Breadcrumb from "./Breadcrumb";
import { getNavigationTrees } from "./navigationTreeServer";
import {
  getNavbarOrderCookie,
  parseNavbarOrder,
} from "./navbarSorting";

const split4nestedBrackets = (s) => {
  let r = [],
    c = "",
    d = 0;
  for (let i = 0; i < s.length; i++) {
    let x = s[i];
    d += x === "[" ? 1 : x === "]" ? -1 : 0;
    if (x === "," && s[i + 1] === " " && d === 0) (r.push(c), (c = ""), i++);
    else c += x;
  }
  return r.concat(c);
};

function getWalletFavCookieKey(routeBase = "/w") {
  return routeBase == "/t" ? "navTradeFavs" : "navWalletFavs";
}

function getFullCookieName(name = "") {
  return `${ckPrefix ?? ""}${name}`;
}

function parseWalletFavs(value) {
  try {
    const text = String(value || "[]");
    const favs = Array.isArray(value)
      ? value
      : JSON.parse(text.startsWith("%") ? decodeURIComponent(text) : text);
    if (!Array.isArray(favs)) return [];

    return favs
      .filter((fav) => fav?.href && fav?.label)
      .map((fav) => ({
        href: String(fav.href),
        label: String(fav.label),
        title: fav.title ? String(fav.title) : String(fav.label),
      }));
  } catch {
    return [];
  }
}

function getTopNavbarKey(entry, index) {
  if (!Array.isArray(entry)) return `link:${String(entry)}`;

  const [value, title] = entry;
  if (value?.type == "walletTree") return `wallet:${value.routeBase}`;
  if (value?.type == "linkMenu") {
    return `menu:${title || value.titleHref || value.favCookieKey}`;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    const firstKey = Array.isArray(first)
      ? first.join(":")
      : String(first || index);
    return `legacy:${title || firstKey}`;
  }
  if (!value) return `text:${title || index}`;

  return `link:${value}:${title || value}`;
}

function getKeyedNavbarLinks(links) {
  const countM = new Map();

  return links.map((entry, index) => {
    const baseKey = getTopNavbarKey(entry, index);
    const count = countM.get(baseKey) ?? 0;
    countM.set(baseKey, count + 1);

    return {
      entry,
      key: count ? `${baseKey}#${count + 1}` : baseKey,
    };
  });
}

function getInitialNavbarOrder(cookies, scope) {
  return parseNavbarOrder(cookies[getNavbarOrderCookie(scope)]);
}

export default async function Navbar() {
  const allCookies = await getNxCookies();
  let ck = new Proxy(allCookies, {
    get: (target, key) =>
      typeof key == "string" ? target[`${ckPrefix ?? ""}${key}`] : target[key],
  });
  const { walletNavTree, refNavTree, dataNavTree } = await getNavigationTrees();

  let links = [["/", "⌂ Home"]]; //txt separator: links.push(['','tx'])
  let etc = [
    ["/editor", "editor"],
    ["/ck", "cookies"],
    ["/login", "login"],
    {
      href: "/ref",
      label: "ref",
      title: "/ref",
      children: refNavTree,
    },
  ];

  links.push([
    {
      type: "linkMenu",
      titleHref: "/d",
      items: dataNavTree,
      favCookieKey: "navDataFavs",
    },
    "data",
  ]);
  links.push([{ type: "walletTree", routeBase: "/w" }, "wallet"]);
  links.push([{ type: "walletTree", routeBase: "/t" }, "trade"]);
  links.push([
    { type: "linkMenu", items: etc, favCookieKey: "navEtcFavs" },
    "etc",
  ]);

  if (ck.navFavs) {
    let fav = isAr(ck.navFavs)
      ? [ck.navFavs]
      : isOb(ck.navFavs)
        ? "" //empty if is object
        : parse(
            ck.navFavs?.split(/, (?=(?:[^\[\]]*(?:\[[^\[\]]*\]))*[^()\[\]]*$)/),
          );
    if (fav) links.push([fav, "fav"]);
  }

  if (ck.navLinks) {
    let navLinks = isAr(ck.navLinks)
      ? [ck.navLinks]
      : parse(split4nestedBrackets(ck.navLinks));
    links.push(...navLinks);
  }

  const topOrderScope = getFullCookieName("navbarTop");
  const keyedLinks = getKeyedNavbarLinks(links);

  return (
    <>
      <div className="navbar">
        <SortableNavbarItems
          scope={topOrderScope}
          initialOrderM={getInitialNavbarOrder(allCookies, topOrderScope)}
        >
          {keyedLinks.map(({ entry: e, key }) => {
            let content;

            if (e?.[0]?.type == "walletTree") {
              const cookieName = getFullCookieName(
                getWalletFavCookieKey(e[0].routeBase),
              );
              content = (
                <NavbarWalletMenu
                  title={e[1]}
                  routeBase={e[0].routeBase}
                  tree={walletNavTree}
                  cookieName={cookieName}
                  initialFavs={parseWalletFavs(
                    ck[getWalletFavCookieKey(e[0].routeBase)],
                  )}
                  initialOrderM={getInitialNavbarOrder(
                    allCookies,
                    cookieName,
                  )}
                />
              );
            } else if (e?.[0]?.type == "linkMenu") {
              const cookieName = getFullCookieName(e[0].favCookieKey);
              content = (
                <NavbarLinkMenu
                  title={e[1]}
                  titleHref={e[0].titleHref}
                  items={e[0].items}
                  cookieName={cookieName}
                  initialFavs={parseWalletFavs(ck[e[0].favCookieKey])}
                  initialOrderM={getInitialNavbarOrder(
                    allCookies,
                    cookieName,
                  )}
                />
              );
            } else if (!isAr(e?.[0])) {
              if (isAr(e)) {
                content = !e[0] ? (
                  <span className="tx">{e[1]}</span>
                ) : e[0] == "/" && e[1] == "⌂ Home" ? (
                  <NavbarHomeLink />
                ) : (
                  <Link href={e[0].startsWith("[") ? "" : e[0]}>
                    {e[1]}
                  </Link>
                );
              } else {
                content = (
                  <Link href={e.startsWith("[") ? "" : e}>{e}</Link>
                );
              }
            } else {
              const orderScope = getFullCookieName(`navLegacy_${key}`);
              content = (
                <NavbarLinkMenu
                  title={e[1]}
                  items={e[0]}
                  orderScope={orderScope}
                  initialOrderM={getInitialNavbarOrder(
                    allCookies,
                    orderScope,
                  )}
                />
              );
            }

            return <Fragment key={key}>{content}</Fragment>;
          })}
        </SortableNavbarItems>
      </div>
      <Breadcrumb
        walletTree={walletNavTree}
        refTree={refNavTree}
        dataTree={dataNavTree}
      />
    </>
  );
}
