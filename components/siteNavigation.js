function buildSiteNavigationMenus({
  walletTree = [],
  dataTree = [],
  refTree = [],
  editorTree = [],
  editorFiles = [],
  editorEmptyFolders = [],
} = {}) {
  const etcItems = [
    {
      href: "/editor",
      label: "editor",
      title: "/editor",
      children: editorTree,
      editorFiles,
      editorEmptyFolders,
    },
    ["/ck", "cookies"],
    ["/login", "login"],
    {
      href: "/ref",
      label: "ref",
      title: "/ref",
      children: refTree,
    },
  ];

  return [
    {
      key: "data",
      label: "data",
      href: "/d",
      type: "linkMenu",
      items: dataTree,
      favCookieKey: "navDataFavs",
    },
    {
      key: "wallet",
      label: "wallet",
      href: "/w",
      type: "walletTree",
      routeBase: "/w",
      items: walletTree,
    },
    {
      key: "trade",
      label: "trade",
      href: "/t",
      type: "walletTree",
      routeBase: "/t",
      items: walletTree,
    },
    {
      key: "etc",
      label: "etc",
      href: "",
      type: "linkMenu",
      items: etcItems,
      favCookieKey: "navEtcFavs",
    },
  ];
}

export { buildSiteNavigationMenus };
