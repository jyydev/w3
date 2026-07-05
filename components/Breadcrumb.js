"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { localEditorStorageEvent } from "@/app/_editorData/browserEditorStorage";
import cgb from "@/app/context";
import {
  getLocalWalletTree,
  getWalletNavUrl,
  mergeTrees,
} from "./NavbarWalletMenu";

const topOptions = [
  { value: "wallet", label: "wallet", href: "/w" },
  { value: "trade", label: "trade", href: "/t" },
  { value: "ref", label: "ref", href: "/ref" },
  { value: "editor", label: "editor", href: "/editor" },
  { value: "cookie", label: "cookie", href: "/ck" },
  { value: "login", label: "login", href: "/login" },
];

const refChildren = [
  { value: "rpc", label: "rpc", href: "/ref/rpc" },
  { value: "api", label: "api", href: "/ref/api" },
  { value: "cache", label: "cache", href: "/ref/cache" },
  { value: "cookie", label: "cookie", href: "/ref/cookie" },
  { value: "env", label: "env", href: "/ref/env" },
  { value: "editor-data", label: "editor data", href: "/ref/editor-data" },
  { value: "test", label: "test", href: "/ref/test" },
];

function getTopValue(pathname = "/") {
  const first = pathname.split("/").filter(Boolean)[0] || "";
  if (first == "w") return "wallet";
  if (first == "t") return "trade";
  if (first == "ck") return "cookie";
  if (["ref", "editor", "login"].includes(first)) return first;

  return "";
}

function getPathParts(pathname = "", routeBase = "") {
  const base = String(routeBase || "").replace(/^\/+|\/+$/g, "");
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] == base ? parts.slice(1).map(decodeURIComponent) : [];
}

function getWalletType(searchParams) {
  return String(searchParams.get("chain") || "").toLowerCase() == "solana"
    ? "solana"
    : "evm";
}

function getTypeUrl(routeBase, walletType) {
  return walletType == "solana" ? `${routeBase}?chain=solana` : routeBase;
}

function getSiblings(parent) {
  return (parent?.children || []).filter((node) => node.type != "wallet");
}

function getWalletChildren(node) {
  return (node?.children || []).filter((child) => child.type == "wallet");
}

function findPathChild(parent, filePath) {
  return getSiblings(parent).find((child) => child.filePath == filePath);
}

function getWalletNodeOption(routeBase, node) {
  const childOptions = [
    ...getSiblings(node).map((child) => getWalletNodeOption(routeBase, child)),
    ...getWalletChildren(node).map((wallet) => ({
      value: `wallet:${wallet.walletName}`,
      label: wallet.label,
      href: getWalletNavUrl(routeBase, wallet),
    })),
  ];

  return {
    value: node.filePath,
    label: node.label,
    href: getWalletNavUrl(routeBase, node),
    children: childOptions,
    node,
  };
}

function getRootWalletOptions(routeBase, typeNode, childOptions = []) {
  return [
    {
      value: "__favs__",
      label: "favs",
      href: getTypeUrl(routeBase, typeNode.walletType),
    },
    {
      value: "__all__",
      label: "all",
      href: getWalletNavUrl(routeBase, {
        walletType: typeNode.walletType,
        filePath: "all",
      }),
    },
    ...childOptions.map((node) => getWalletNodeOption(routeBase, node)),
  ];
}

function getWalletTypeOptions(routeBase, tree = []) {
  return tree.map((node) => ({
    value: node.walletType,
    label: node.label || (node.walletType == "solana" ? "Solana" : "EVM"),
    href: getTypeUrl(routeBase, node.walletType),
    children: getRootWalletOptions(routeBase, node, getSiblings(node)),
  }));
}

function getTopMenuOptions(tree = []) {
  return topOptions.map((option) => {
    if (option.value == "wallet") {
      return { ...option, children: getWalletTypeOptions("/w", tree) };
    }
    if (option.value == "trade") {
      return { ...option, children: getWalletTypeOptions("/t", tree) };
    }
    if (option.value == "ref") return { ...option, children: refChildren };

    return option;
  });
}

function SelectCrumb({
  value,
  options,
  disabled = false,
  ariaLabel = "breadcrumb",
  href = "",
  fallbackLabel = "select",
}) {
  const [closed, setClosed] = useState(false);
  const selected = options.find((option) => option.value == value);
  const label = selected?.label || fallbackLabel;
  const selectableOptions = options.filter(
    (option) => !option.disabled && option.value != value,
  );
  const canOpen = !disabled && selectableOptions.length > 0;
  const canNavigate = !disabled && !!href;
  const isPlaceholder = !selected && label == fallbackLabel;

  function renderMenu(options, keyPrefix = "menu") {
    return (
      <span className="breadcrumbMenu">
        {options.map((option) =>
          renderMenuOption(option, `${keyPrefix}:${option.value}`),
        )}
      </span>
    );
  }

  function renderMenuOption(option, key) {
    const hasChildren = !!option.children?.length;
    const className = `breadcrumbMenuItem ${
      option.value == value ? "active" : ""
    }`;
    const content = option.href && !option.disabled ? (
      <Link href={option.href} className={className} onClick={() => setClosed(true)}>
        {option.label}
      </Link>
    ) : (
      <button
        type="button"
        className={className}
        disabled={option.disabled}
        onClick={() => setClosed(true)}
      >
        {option.label}
      </button>
    );

    return (
      <span
        key={key}
        className={`breadcrumbMenuNode ${hasChildren ? "hasChildren" : ""}`}
      >
        {content}
        {hasChildren && <span className="breadcrumbMenuCaret">&gt;</span>}
        {hasChildren && renderMenu(option.children, key)}
      </span>
    );
  }

  return (
    <>
      <span className="breadcrumbSep">&gt;</span>
      <span
        className={`breadcrumbCrumb ${disabled ? "disabled" : ""} ${
          closed ? "closed" : ""
        } ${isPlaceholder ? "placeholder" : ""}`}
        onMouseEnter={() => setClosed(false)}
        onFocus={() => setClosed(false)}
      >
        {canNavigate ? (
          <Link
            href={href}
            className="breadcrumbCrumbLabel"
            onClick={() => setClosed(true)}
            aria-label={`go to ${label}`}
          >
            {label}
          </Link>
        ) : (
          <span className="breadcrumbCrumbLabelWrap">
            <span className="breadcrumbCrumbLabel inert" aria-label={ariaLabel}>
              {label}
            </span>
          </span>
        )}
        {canOpen && (
          <span className="breadcrumbCrumbMenuWrap">
            <button
              type="button"
              className="breadcrumbCrumbToggle"
              aria-label={`${ariaLabel} options`}
              aria-haspopup="menu"
            >
              <span className="breadcrumbCaret"></span>
            </button>
          </span>
        )}
        {canOpen && renderMenu(options, "crumb")}
      </span>
    </>
  );
}

function WalletCrumbs({ routeBase, tree = [] }) {
  const pathname = usePathname() || routeBase;
  const searchParams = useSearchParams();
  const walletType = getWalletType(searchParams);
  const pathParts = getPathParts(pathname, routeBase);
  const selectedW = searchParams.get("w") || "";
  const typeNode =
    tree.find((node) => node.walletType == walletType) ||
    tree.find((node) => node.walletType == "evm") ||
    tree[0];
  const typeOptions = getWalletTypeOptions(routeBase, tree);

  if (!typeNode) {
    return (
      <SelectCrumb
        value="missing"
        disabled
        options={[{ value: "missing", label: "not found" }]}
        fallbackLabel="not found"
      />
    );
  }

  const crumbs = [
    <SelectCrumb
      key="type"
      value={typeNode.walletType}
      options={typeOptions}
      ariaLabel="wallet type"
      href={getTypeUrl(routeBase, typeNode.walletType)}
    />,
  ];

  let parent = typeNode;
  let currentNode = typeNode;
  let foundAll = true;
  const rootChildOptions = getSiblings(typeNode);
  const rootWalletOptions = getRootWalletOptions(
    routeBase,
    typeNode,
    rootChildOptions,
  );

  if (pathParts.length == 1 && pathParts[0] == "all") {
    crumbs.push(
      <SelectCrumb
        key="all"
        value="__all__"
        ariaLabel="wallet path"
        href={rootWalletOptions.find((option) => option.value == "__all__")?.href}
        options={rootWalletOptions}
      />,
    );

    return crumbs;
  }

  for (let i = 0; i < pathParts.length; i++) {
    const currentPath = pathParts.slice(0, i + 1).join("/");
    const child = findPathChild(parent, currentPath);

    if (!child) {
      const label = `not found: ${pathParts.slice(i).join("/")}`;
      crumbs.push(
        <SelectCrumb
          key={`missing-${currentPath}`}
          value="missing"
          disabled
          options={[{ value: "missing", label }]}
          fallbackLabel={label}
        />,
      );
      foundAll = false;
      break;
    }

    const siblings = getSiblings(parent);
    const pathOptions =
      i == 0
        ? rootWalletOptions
        : siblings.map((node) => getWalletNodeOption(routeBase, node));
    crumbs.push(
      <SelectCrumb
        key={currentPath}
        value={child.filePath}
        ariaLabel="wallet path"
        href={getWalletNavUrl(routeBase, child)}
        options={pathOptions}
      />,
    );
    parent = child;
    currentNode = child;
  }

  if (!foundAll) return crumbs;

  const childOptions = getSiblings(currentNode);
  const rootCrumb = currentNode == typeNode && !pathParts.length;
  if (childOptions.length || rootCrumb) {
    const options = rootCrumb
      ? rootWalletOptions
      : childOptions.map((node) => getWalletNodeOption(routeBase, node));

    crumbs.push(
      <SelectCrumb
        key={`${currentNode.walletType}:${currentNode.filePath}:next`}
        value={rootCrumb ? "__favs__" : ""}
        ariaLabel="wallet child path"
        href={rootCrumb ? rootWalletOptions[0]?.href : ""}
        fallbackLabel={rootCrumb ? "favs" : "select"}
        options={options}
      />,
    );
  }

  const wallets = getWalletChildren(currentNode);
  if (wallets.length) {
    const selectedWallet = wallets.find(
      (wallet) => wallet.walletName == selectedW,
    );
    crumbs.push(
      <SelectCrumb
        key={`${currentNode.walletType}:${currentNode.filePath}:wallet`}
        value={selectedWallet?.walletName || ""}
        ariaLabel="wallet name"
        href={selectedWallet ? getWalletNavUrl(routeBase, selectedWallet) : ""}
        fallbackLabel="select"
        options={[
          ...wallets.map((wallet) => ({
            value: wallet.walletName,
            label: wallet.walletName,
            href: getWalletNavUrl(routeBase, wallet),
          })),
        ]}
      />,
    );
  }

  return crumbs;
}

function RefCrumbs() {
  const pathname = usePathname() || "/ref";
  const parts = pathname.split("/").filter(Boolean).slice(1);
  const current = parts[0] || "";

  if (!current) {
    return (
      <SelectCrumb
        value=""
        ariaLabel="ref page"
        fallbackLabel="select"
        options={refChildren}
      />
    );
  }

  const known = refChildren.find((entry) => entry.value == current);
  if (known) {
    return (
      <SelectCrumb
        value={known.value}
        ariaLabel="ref page"
        href={known.href}
        options={refChildren}
      />
    );
  }

  return (
    <SelectCrumb
      value="missing"
      disabled
      options={[{ value: "missing", label: `not found: ${parts.join("/")}` }]}
      fallbackLabel={`not found: ${parts.join("/")}`}
    />
  );
}

function BreadcrumbInner({ walletTree = [] }) {
  const pathname = usePathname() || "/";
  const topValue = getTopValue(pathname);
  const topCurrent = topOptions.find((option) => option.value == topValue);
  const { navigationLoading } = cgb();
  const [localTree, setLocalTree] = useState([]);
  const tree = useMemo(
    () => mergeTrees(walletTree, localTree),
    [walletTree, localTree],
  );
  const topMenuOptions = useMemo(() => getTopMenuOptions(tree), [tree]);

  useEffect(() => {
    function refreshLocalTree() {
      setLocalTree(getLocalWalletTree());
    }

    refreshLocalTree();
    window.addEventListener(localEditorStorageEvent, refreshLocalTree);
    window.addEventListener("storage", refreshLocalTree);

    return () => {
      window.removeEventListener(localEditorStorageEvent, refreshLocalTree);
      window.removeEventListener("storage", refreshLocalTree);
    };
  }, []);

  return (
    <nav className="breadcrumbNav" aria-label="Breadcrumb">
      <Link href="/" className="breadcrumbHome">
        home
      </Link>
      <SelectCrumb
        value={topValue}
        ariaLabel="site section"
        href={topCurrent?.href || ""}
        fallbackLabel="select"
        options={topMenuOptions}
      />
      {topValue == "wallet" && <WalletCrumbs routeBase="/w" tree={tree} />}
      {topValue == "trade" && <WalletCrumbs routeBase="/t" tree={tree} />}
      {topValue == "ref" && <RefCrumbs />}
      {navigationLoading && (
        <span className="breadcrumbLoading" role="status" aria-live="polite">
          loading...
        </span>
      )}
    </nav>
  );
}

export default function Breadcrumb(props) {
  return (
    <Suspense fallback={null}>
      <BreadcrumbInner {...props} />
    </Suspense>
  );
}
