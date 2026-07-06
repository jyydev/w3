import Link from "next/link";
import { v4 as uid } from "uuid";
import { ckPrefix } from "@/sets";
import fs from "fs/promises";
import path from "path";
import NavbarLinkMenu from "./NavbarLinkMenu";
import NavbarWalletMenu from "./NavbarWalletMenu";
import Breadcrumb from "./Breadcrumb";

const walletTypeLabels = {
  evm: "EVM",
  solana: "Solana",
};

function getWalletType(folder = "") {
  return folder.toLowerCase() == "solana" ? "solana" : "evm";
}

function getWalletTypeLabel(type = "") {
  return walletTypeLabels[type] || type;
}

function parseWalletNames(input = "") {
  let rows = input;
  const text = String(input || "").trim();
  try {
    rows = text ? JSON.parse(text) : [];
  } catch {
    rows = [];
  }

  const names = [];
  const seen = new Set();
  const entries = Array.isArray(rows)
    ? rows.map((entry) => String(entry?.wallet ?? entry?.name ?? "").trim())
    : [];

  for (const name of entries) {
    if (!name || seen.has(name)) continue;

    seen.add(name);
    names.push(name);
  }

  return names;
}

async function readWalletNavChildren(dir, walletType, relPath = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() && path.extname(entry.name).toLowerCase() == ".json",
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const fileM = new Map(
    files.map((entry) => [
      path.basename(entry.name, path.extname(entry.name)),
      entry,
    ]),
  );
  const folderM = new Map(folders.map((entry) => [entry.name, entry]));
  const names = [...new Set([...folderM.keys(), ...fileM.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );

  return Promise.all(
    names.map(async (name) => {
      const folder = folderM.get(name);
      const file = fileM.get(name);
      const filePath = [relPath, name].filter(Boolean).join("/");
      const folderPath = path.join(dir, name);
      const fileText = file
        ? await fs.readFile(path.join(dir, file.name), "utf8")
        : "";
      const walletNames = file ? parseWalletNames(fileText) : [];
      const folderChildren = folder
        ? await readWalletNavChildren(folderPath, walletType, filePath)
        : [];
      const folderEmpty = folder
        ? !(await fs.readdir(folderPath)).length
        : false;
      const fileEmpty = file ? !walletNames.length : false;
      const walletChildren = file
        ? walletNames.map((walletName) => ({
            type: "wallet",
            label: walletName,
            walletType,
            filePath,
            walletName,
          }))
        : [];

      return {
        type: folder && file ? "mixed" : folder ? "folder" : "file",
        label: name,
        walletType,
        filePath,
        deletable:
          fileEmpty || folderEmpty
            ? {
                kind: fileEmpty ? "file" : "folder",
                source: filePath,
              }
            : null,
        children: [...folderChildren, ...walletChildren],
      };
    }),
  );
}

async function getWalletNavTree() {
  const root = path.join(process.cwd(), "data/editor/wallets");
  const entries = await fs
    .readdir(root, { withFileTypes: true })
    .catch((e) => (e.code == "ENOENT" ? [] : Promise.reject(e)));
  const order = ["evm", "solana"];

  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => {
        const ai = order.indexOf(a.name.toLowerCase());
        const bi = order.indexOf(b.name.toLowerCase());
        if (ai >= 0 || bi >= 0) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        return a.name.localeCompare(b.name);
      })
      .map(async (entry) => {
        const walletType = getWalletType(entry.name);

        return {
          type: "folder",
          label: getWalletTypeLabel(walletType),
          walletType,
          filePath: "",
          children: await readWalletNavChildren(
            path.join(root, entry.name),
            walletType,
          ),
        };
      }),
  );
}

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
  const walletNavTree = await getWalletNavTree();

  let links = [["/", "⌂ Home"]]; //txt separator: links.push(['','tx'])
  let etc = [
    ["/editor", "editor"],
    ["/ck", "cookies"],
    ["/login", "login"],
    ["/ref", "ref"],
  ];

  links.push([{ type: "walletTree", routeBase: "/w" }, "wallet"]);
  links.push([{ type: "walletTree", routeBase: "/t" }, "trade"]);
  links.push([{ type: "linkMenu", items: etc, favCookieKey: "navEtcFavs" }, "etc"]);

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
            <div /*multi-links: dropdown with caret icon*/
              className={
                e[1] ? "dropdown title" /*title:margin left no -ve*/ : "dropdown"
              }
              key={uid()}
            >
              <button className="dropbtn">
                {e[1]}
                <i className="custom-caret"></i>
              </button>
              <div className="dropdown-content">
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
            </div>
          );
        })}
      </div>
      <Breadcrumb walletTree={walletNavTree} />
    </>
  );
}
