import Link from "next/link";
import { v4 as uid } from "uuid";
import { ckPrefix } from "@/sets";
import NavbarLinkMenu from "./NavbarLinkMenu";
import NavbarWalletMenu from "./NavbarWalletMenu";
import Breadcrumb from "./Breadcrumb";
import HoverMenu from "./HoverMenu";
import { getNavigationTrees } from "./navigationTreeServer";

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

export default async function Navbar() {
  let ck = new Proxy(await getNxCookies(), {
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

  return (
    <>
      <div className="navbar">
        {links.map((e) /*e[0]:link e[1]:title*/ => {
          return e?.[0]?.type == "walletTree" ? (
            <NavbarWalletMenu
              key={e[1]}
              title={e[1]}
              routeBase={e[0].routeBase}
              tree={walletNavTree}
              cookieName={getFullCookieName(
                getWalletFavCookieKey(e[0].routeBase),
              )}
              initialFavs={parseWalletFavs(
                ck[getWalletFavCookieKey(e[0].routeBase)],
              )}
            />
          ) : e?.[0]?.type == "linkMenu" ? (
            <NavbarLinkMenu
              key={e[1]}
              title={e[1]}
              titleHref={e[0].titleHref}
              items={e[0].items}
              cookieName={getFullCookieName(e[0].favCookieKey)}
              initialFavs={parseWalletFavs(ck[e[0].favCookieKey])}
            />
          ) : !isAr(e?.[0] /*single link (not dropdown)*/) ? (
            isAr(e) /*e=[link, title]*/ ? (
              !e[0] /*no link, tx only: e=['',title]*/ ? (
                <span className="tx" key={uid()}>
                  {e[1]}
                </span>
              ) : (
                <Link
                  /*e=[link,title]*/ href={e[0].startsWith("[") ? "" : e[0]}
                  key={uid()}
                >
                  {e[1]}
                </Link>
              )
            ) : (
              /*link only*/ <Link
                href={e.startsWith("[") ? "" /*err if str=[..]*/ : e}
                key={uid()}
              >
                {e}
              </Link>
            )
          ) : (
            <HoverMenu /*multi-links: dropdown with caret icon*/
              className={
                e[1]
                  ? "dropdown title" /*title:margin left no -ve*/
                  : "dropdown"
              }
              key={uid()}
            >
              <button className="navigationMenuTrigger dropbtn">
                {e[1]}
                <i className="custom-caret"></i>
              </button>
              <div className="navigationMenuPanel dropdown-content">
                {
                  /*e[0]=[[title,link],link,]*/ e[0].map(
                    (e /*e=[link, title] or link*/) =>
                      isAr(e) ? (
                        /*e=[link, title]*/ e[0] ? (
                          <Link
                            href={e[0].startsWith("[") ? "" : e[0]}
                            key={uid()}
                          >
                            {e[1]}
                          </Link>
                        ) : (
                          /*no link: section title*/ <div
                            className="section"
                            key={uid()}
                          >
                            {e[1] /*e=['',tx]*/}
                          </div>
                        )
                      ) : (
                        /*e=link only*/ <Link
                          href={e.startsWith("[") ? "" : e}
                          key={uid()}
                        >
                          {e}
                        </Link>
                      ),
                  )
                }
              </div>
            </HoverMenu>
          );
        })}
      </div>
      <Breadcrumb
        walletTree={walletNavTree}
        refTree={refNavTree}
        dataTree={dataNavTree}
      />
    </>
  );
}
