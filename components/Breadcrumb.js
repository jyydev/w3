"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { localEditorStorageEvent } from "@/app/browserEditorStorage";
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

function SelectCrumb({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel = "breadcrumb",
  href = "",
  fallbackLabel = "select",
}) {
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  const selected = options.find((option) => option.value == value);
  const label = selected?.label || fallbackLabel;
  const selectableOptions = options.filter(
    (option) => !option.disabled && option.value != value,
  );
  const canOpen = !disabled && selectableOptions.length > 0;
  const canNavigate = !disabled && !!href;
  const isPlaceholder = !selected && label == fallbackLabel;
  const renderMenu = (keyPrefix) => (
    <span className="breadcrumbMenu">
      {options.map((option) => (
        <button
          type="button"
          key={`${keyPrefix}:${option.value}`}
          className={`breadcrumbMenuItem ${
            option.value == value ? "active" : ""
          }`}
          disabled={option.disabled}
          onClick={() => {
            setClosed(true);
            onChange?.(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </span>
  );

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
          <button
            type="button"
            className="breadcrumbCrumbLabel"
            onClick={() => {
              setClosed(true);
              router.push(href);
            }}
            aria-label={`go to ${label}`}
          >
            {label}
          </button>
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
        {canOpen && renderMenu("crumb")}
      </span>
    </>
  );
}

function WalletCrumbs({ routeBase, tree = [] }) {
  const router = useRouter();
  const pathname = usePathname() || routeBase;
  const searchParams = useSearchParams();
  const walletType = getWalletType(searchParams);
  const pathParts = getPathParts(pathname, routeBase);
  const selectedW = searchParams.get("w") || "";
  const typeNode =
    tree.find((node) => node.walletType == walletType) ||
    tree.find((node) => node.walletType == "evm") ||
    tree[0];
  const typeOptions = tree.map((node) => ({
    value: node.walletType,
    label: node.label || (node.walletType == "solana" ? "Solana" : "EVM"),
  }));

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
      onChange={(nextType) => router.push(getTypeUrl(routeBase, nextType))}
    />,
  ];

  let parent = typeNode;
  let currentNode = typeNode;
  let foundAll = true;

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
    crumbs.push(
      <SelectCrumb
        key={currentPath}
        value={child.filePath}
        ariaLabel="wallet path"
        href={getWalletNavUrl(routeBase, child)}
        options={siblings.map((node) => ({
          value: node.filePath,
          label: node.label,
        }))}
        onChange={(filePath) => {
          const nextNode = siblings.find((node) => node.filePath == filePath);
          if (nextNode) router.push(getWalletNavUrl(routeBase, nextNode));
        }}
      />,
    );
    parent = child;
    currentNode = child;
  }

  if (!foundAll) return crumbs;

  const childOptions = getSiblings(currentNode);
  if (childOptions.length) {
    crumbs.push(
      <SelectCrumb
        key={`${currentNode.walletType}:${currentNode.filePath}:next`}
        value=""
        ariaLabel="wallet child path"
        fallbackLabel="select"
        options={[
          ...childOptions.map((node) => ({
            value: node.filePath,
            label: node.label,
          })),
        ]}
        onChange={(filePath) => {
          const nextNode = childOptions.find(
            (node) => node.filePath == filePath,
          );
          if (nextNode) router.push(getWalletNavUrl(routeBase, nextNode));
        }}
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
          })),
        ]}
        onChange={(walletName) => {
          if (!walletName)
            return router.push(getWalletNavUrl(routeBase, currentNode));
          const nextWallet = wallets.find(
            (wallet) => wallet.walletName == walletName,
          );
          if (nextWallet) router.push(getWalletNavUrl(routeBase, nextWallet));
        }}
      />,
    );
  }

  return crumbs;
}

function RefCrumbs() {
  const router = useRouter();
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
        onChange={(value) => {
          const child = refChildren.find((entry) => entry.value == value);
          if (child) router.push(child.href);
        }}
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
        onChange={(value) => {
          const child = refChildren.find((entry) => entry.value == value);
          if (child) router.push(child.href);
        }}
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
  const router = useRouter();
  const pathname = usePathname() || "/";
  const topValue = getTopValue(pathname);
  const topCurrent = topOptions.find((option) => option.value == topValue);
  const [localTree, setLocalTree] = useState([]);
  const tree = useMemo(
    () => mergeTrees(walletTree, localTree),
    [walletTree, localTree],
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
      <Link href="/" className="breadcrumbHome">
        home
      </Link>
      <SelectCrumb
        value={topValue}
        ariaLabel="site section"
        href={topCurrent?.href || ""}
        fallbackLabel="section"
        options={topOptions}
        onChange={(value) => {
          const next = topOptions.find((option) => option.value == value);
          router.push(next?.href || "/");
        }}
      />
      {topValue == "wallet" && <WalletCrumbs routeBase="/w" tree={tree} />}
      {topValue == "trade" && <WalletCrumbs routeBase="/t" tree={tree} />}
      {topValue == "ref" && <RefCrumbs />}
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
