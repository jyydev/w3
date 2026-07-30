"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { localEditorStorageEvent } from "@/app/_editorData/browserEditorStorage";
import useCgb from "@/app/context";
import HoverMenu from "./HoverMenu";
import { CycleButtonPair } from "./Shared";
import {
  getLocalWalletTree,
  getWalletNavUrl,
  mergeTrees,
} from "./NavbarWalletMenu";

const topOptions = [
  { value: "wallet", label: "wallet", href: "/w" },
  { value: "trade", label: "trade", href: "/t" },
  { value: "data", label: "data", href: "/d" },
  { value: "ref", label: "ref", href: "/ref" },
  { value: "editor", label: "editor", href: "/editor" },
  { value: "cookie", label: "cookie", href: "/ck" },
  { value: "login", label: "login", href: "/login" },
];

const breadcrumbHistoryStorageKey = "w3_breadcrumb_history";

function getCurrentHistoryRoute() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function isHistoryTraversalLoad() {
  return (
    window.performance?.getEntriesByType?.("navigation")?.[0]?.type ==
    "back_forward"
  );
}

function readBreadcrumbHistory() {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(breadcrumbHistoryStorageKey),
    );
    if (!Array.isArray(value?.entries) || !value.entries.length) return null;

    const entries = value.entries.filter((entry) => typeof entry == "string");
    if (!entries.length) return null;

    return {
      entries,
      index: Math.max(
        0,
        Math.min(Number(value.index) || 0, entries.length - 1),
      ),
      hasPrior: !!value.hasPrior,
    };
  } catch {
    return null;
  }
}

function rememberBreadcrumbHistory(route, traversing = false) {
  let historyE = readBreadcrumbHistory();
  if (!historyE) {
    historyE = {
      entries: [route],
      index: 0,
      hasPrior: window.history.length > 1,
    };
  } else if (historyE.entries[historyE.index] != route) {
    const previousIndex = historyE.index - 1;
    const nextIndex = historyE.index + 1;

    if (traversing && historyE.entries[previousIndex] == route) {
      historyE.index = previousIndex;
    } else if (traversing && historyE.entries[nextIndex] == route) {
      historyE.index = nextIndex;
    } else {
      historyE.entries = historyE.entries.slice(0, historyE.index + 1);
      historyE.entries.push(route);
      historyE.index = historyE.entries.length - 1;
    }
  }

  try {
    window.sessionStorage.setItem(
      breadcrumbHistoryStorageKey,
      JSON.stringify(historyE),
    );
  } catch {}

  return historyE;
}

function getHistoryAvailability(historyE) {
  const navigation = window.navigation;
  if (
    typeof navigation?.canGoBack == "boolean" &&
    typeof navigation?.canGoForward == "boolean"
  ) {
    return {
      canGoBack: navigation.canGoBack,
      canGoForward: navigation.canGoForward,
    };
  }

  return {
    canGoBack: historyE.index > 0 || historyE.hasPrior,
    canGoForward: historyE.index < historyE.entries.length - 1,
  };
}

function getTopValue(pathname = "/") {
  const first = pathname.split("/").filter(Boolean)[0] || "";
  if (first == "w") return "wallet";
  if (first == "t") return "trade";
  if (first == "d") return "data";
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
  const type = String(searchParams.get("chain") || "").toLowerCase();
  return ["solana", "tron"].includes(type) ? type : "evm";
}

function getTypeUrl(routeBase, walletType) {
  return walletType == "evm"
    ? routeBase
    : `${routeBase}?chain=${encodeURIComponent(walletType)}`;
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
    label:
      node.label ||
      (node.walletType == "solana"
        ? "Solana"
        : node.walletType == "tron"
          ? "Tron"
          : "EVM"),
    href: getTypeUrl(routeBase, node.walletType),
    children: getRootWalletOptions(routeBase, node, getSiblings(node)),
  }));
}

function getTopMenuOptions(tree = [], refTree = [], dataTree = []) {
  return topOptions.map((option) => {
    if (option.value == "wallet") {
      return { ...option, children: getWalletTypeOptions("/w", tree) };
    }
    if (option.value == "trade") {
      return { ...option, children: getWalletTypeOptions("/t", tree) };
    }
    if (option.value == "data") return { ...option, children: dataTree };
    if (option.value == "ref") return { ...option, children: refTree };

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
  const [open, setOpen] = useState(false);
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
      <span className="navigationMenuPanel breadcrumbMenu">
        {options.map((option) =>
          renderMenuOption(option, `${keyPrefix}:${option.value}`),
        )}
      </span>
    );
  }

  function renderMenuOption(option, key) {
    const hasChildren = !!option.children?.length;
    const className = [
      "breadcrumbMenuItem",
      hasChildren ? "navigationMenuTrigger" : "",
      option.value == value ? "active" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const content = option.href && !option.disabled ? (
      <Link
        href={option.href}
        className={className}
        onClick={() => setOpen(false)}
      >
        {option.label}
      </Link>
    ) : (
      <button
        type="button"
        className={className}
        disabled={option.disabled}
        onClick={() => setOpen(false)}
      >
        {option.label}
      </button>
    );

    const nodeContent = (
      <>
        {content}
        {hasChildren && (
          <span className="navigationMenuTrigger breadcrumbMenuCaret">
            &gt;
          </span>
        )}
        {hasChildren && renderMenu(option.children, key)}
      </>
    );

    return hasChildren ? (
      <HoverMenu
        as="span"
        key={key}
        className="breadcrumbMenuNode hasChildren"
      >
        {nodeContent}
      </HoverMenu>
    ) : (
      <span key={key} className="breadcrumbMenuNode">
        {nodeContent}
      </span>
    );
  }

  return (
    <>
      <span className="breadcrumbSep">&gt;</span>
      <HoverMenu
        as="span"
        open={open}
        onOpenChange={setOpen}
        disabled={!canOpen}
        className={`breadcrumbCrumb ${disabled ? "disabled" : ""} ${
          isPlaceholder ? "placeholder" : ""
        }`}
      >
        {canNavigate ? (
          <Link
            href={href}
            className="navigationMenuTrigger breadcrumbCrumbLabel"
            onClick={() => setOpen(false)}
            aria-label={`go to ${label}`}
          >
            {label}
          </Link>
        ) : (
          <span className="breadcrumbCrumbLabelWrap">
            <span
              className="navigationMenuTrigger breadcrumbCrumbLabel inert"
              aria-label={ariaLabel}
            >
              {label}
            </span>
          </span>
        )}
        {canOpen && (
          <span className="breadcrumbCrumbMenuWrap">
            <button
              type="button"
              className="navigationMenuTrigger breadcrumbCrumbToggle"
              aria-label={`${ariaLabel} options`}
              aria-haspopup="menu"
            >
              <span className="breadcrumbCaret"></span>
            </button>
          </span>
        )}
        {canOpen && renderMenu(options, "crumb")}
      </HoverMenu>
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

function RouteCrumbs({ routeBase, tree = [] }) {
  const pathname = usePathname() || routeBase;
  const parts = getPathParts(pathname, routeBase);

  if (!parts.length) {
    return (
      <SelectCrumb
        value=""
        ariaLabel={`${routeBase} page`}
        fallbackLabel="select"
        options={tree}
      />
    );
  }

  const crumbs = [];
  let options = tree;
  let currentNode = null;

  for (let i = 0; i < parts.length; i++) {
    const part = decodeURIComponent(parts[i]);
    const known = options.find((entry) => entry.value == part);
    if (!known) {
      crumbs.push(
        <SelectCrumb
          key={`missing:${parts.slice(i).join("/")}`}
          value="missing"
          disabled
          options={[
            {
              value: "missing",
              label: `not found: ${parts.slice(i).join("/")}`,
            },
          ]}
          fallbackLabel={`not found: ${parts.slice(i).join("/")}`}
        />,
      );
      return crumbs;
    }

    crumbs.push(
      <SelectCrumb
        key={
          known.href ||
          `${routeBase}:${parts.slice(0, i + 1).join("/")}`
        }
        value={known.value}
        ariaLabel={`${routeBase} page`}
        href={known.href}
        disabled={known.disabled && !known.children?.length}
        options={options}
      />,
    );
    currentNode = known;
    options = known.children || [];
  }

  if (currentNode?.children?.length) {
    crumbs.push(
      <SelectCrumb
        key={`${currentNode.href || currentNode.value}:child`}
        value=""
        ariaLabel={`${routeBase} child page`}
        fallbackLabel="select"
        options={currentNode.children}
      />,
    );
  }

  return crumbs;
}

function BreadcrumbHistoryButtons() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const routeKey = `${pathname}${search ? `?${search}` : ""}`;
  const [availability, setAvailability] = useState({
    canGoBack: false,
    canGoForward: false,
  });
  const initialSyncRef = useRef(true);

  useEffect(() => {
    function sync(traversing = false) {
      const historyE = rememberBreadcrumbHistory(
        getCurrentHistoryRoute(),
        traversing,
      );
      setAvailability(getHistoryAvailability(historyE));
    }

    function onPopState() {
      sync(true);
    }

    const initialTraversal =
      initialSyncRef.current && isHistoryTraversalLoad();
    initialSyncRef.current = false;
    sync(initialTraversal);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [routeKey]);

  return (
    <span className="breadcrumbHistoryControls">
      <CycleButtonPair
        className="breadcrumbHistoryButtons"
        onPrev={() => window.history.back()}
        onNext={() => window.history.forward()}
        prevDisabled={!availability.canGoBack}
        nextDisabled={!availability.canGoForward}
        prevProps={{
          className: "breadcrumbHistoryButton",
          "aria-label": "back",
          title: "back",
        }}
        nextProps={{
          className: "breadcrumbHistoryButton",
          "aria-label": "forward",
          title: "forward",
        }}
      />
      <button
        type="button"
        className="btn small bgGray breadcrumbHistoryButton"
        aria-label="refresh"
        title="refresh"
        onClick={() => window.location.reload()}
      >
        <svg
          className="breadcrumbRefreshIcon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.74 10h-2.09A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z" />
        </svg>
      </button>
    </span>
  );
}

function BreadcrumbInner({
  walletTree = [],
  refTree = [],
  dataTree = [],
}) {
  const pathname = usePathname() || "/";
  const topValue = getTopValue(pathname);
  const topCurrent = topOptions.find((option) => option.value == topValue);
  const { navigationLoading } = useCgb();
  const [localTree, setLocalTree] = useState([]);
  const tree = useMemo(
    () => mergeTrees(walletTree, localTree),
    [walletTree, localTree],
  );
  const topMenuOptions = useMemo(
    () => getTopMenuOptions(tree, refTree, dataTree),
    [tree, refTree, dataTree],
  );

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
      <BreadcrumbHistoryButtons />
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
      {topValue == "data" && (
        <RouteCrumbs routeBase="/d" tree={dataTree} />
      )}
      {topValue == "ref" && (
        <RouteCrumbs routeBase="/ref" tree={refTree} />
      )}
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
