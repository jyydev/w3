import Link from "next/link";
import { Fragment } from "react";
import { ckPrefix } from "@/sets";
import { favAddrCookie, parseFavAddrs } from "@/app/w/favAddrs";
import NavbarLinkMenu from "./NavbarLinkMenu";
import NavbarWalletMenu from "./NavbarWalletMenu";
import NavbarHomeLink from "./NavbarHomeLink";
import NavbarCustomLinks from "./NavbarCustomLinks";
import Breadcrumb from "./Breadcrumb";
import { getNavigationTrees } from "./navigationTreeServer";
import { buildSiteNavigationMenus } from "./siteNavigation";
import {
  getNavbarOrderCookie,
  parseNavbarOrder,
} from "./navbarSorting";

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
  const {
    walletNavTree,
    refNavTree,
    dataNavTree,
    editorFiles,
    editorEmptyFolders,
    editorNavTree,
  } = await getNavigationTrees();

  const menus = buildSiteNavigationMenus({
    walletTree: walletNavTree,
    dataTree: dataNavTree,
    refTree: refNavTree,
    editorTree: editorNavTree,
    editorFiles,
    editorEmptyFolders,
  });
  const links = [
    ["/", "⌂ Home"],
    ...menus.map((menu) => [
      menu.type == "walletTree"
        ? {
            type: "walletTree",
            routeBase: menu.routeBase,
            items: menu.items,
          }
        : {
            type: "linkMenu",
            titleHref: menu.href,
            items: menu.items,
            favCookieKey: menu.favCookieKey,
          },
      menu.label,
    ]),
  ];

  const topOrderScope = getFullCookieName("navbarTop");
  const keyedLinks = getKeyedNavbarLinks(links);
  const initialFavoriteWallets = parseFavAddrs(allCookies[favAddrCookie]);

  return (
    <>
      <div className="navbar">
        <NavbarCustomLinks
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
                  tree={e[0].items}
                  cookieName={cookieName}
                  initialFavoriteWallets={initialFavoriteWallets}
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
        </NavbarCustomLinks>
      </div>
      <Breadcrumb
        walletTree={walletNavTree}
        refTree={refNavTree}
        dataTree={dataNavTree}
        editorFiles={editorFiles}
        editorEmptyFolders={editorEmptyFolders}
        editorTree={editorNavTree}
      />
    </>
  );
}
