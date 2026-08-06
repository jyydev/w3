import { cache } from "react";
import fs from "fs/promises";
import path from "path";
import { buildEditorNavTree } from "./editorNavigation";

const walletTypeLabels = {
  evm: "EVM",
  solana: "Solana",
  tron: "Tron",
};
const routePageFilePattern = /^page\.(?:js|jsx|ts|tsx)$/i;
const allowedEditorExts = new Set([".json", ".txt", ".js"]);

function getWalletType(folder = "") {
  const type = folder.toLowerCase();
  return ["evm", "solana", "tron"].includes(type) ? type : "evm";
}

function getWalletTypeLabel(type = "") {
  return walletTypeLabels[type] || type;
}

function parseWalletEntries(input = "") {
  let rows = input;
  const text = String(input || "").trim();
  try {
    rows = text ? JSON.parse(text) : [];
  } catch {
    rows = [];
  }

  const walletEntries = [];
  const seen = new Set();
  const entries = Array.isArray(rows) ? rows : [];

  for (const entry of entries) {
    const walletName = String(entry?.wallet ?? entry?.name ?? "").trim();
    if (!walletName || seen.has(walletName)) continue;

    seen.add(walletName);
    walletEntries.push({
      walletName,
      address: String(entry?.address ?? "").trim(),
    });
  }

  return walletEntries;
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
      const walletEntries = file ? parseWalletEntries(fileText) : [];
      const folderChildren = folder
        ? await readWalletNavChildren(folderPath, walletType, filePath)
        : [];
      const folderEmpty = folder
        ? !(await fs.readdir(folderPath)).length
        : false;
      const fileEmpty = file ? !walletEntries.length : false;
      const walletChildren = file
        ? walletEntries.map(({ walletName, address }) => ({
            type: "wallet",
            label: walletName,
            walletType,
            filePath,
            walletName,
            address,
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

async function buildWalletNavTree() {
  const root = path.join(process.cwd(), "data/editor/wallets");
  const entries = await fs
    .readdir(root, { withFileTypes: true })
    .catch((error) =>
      error.code == "ENOENT" ? [] : Promise.reject(error),
    );
  const order = ["evm", "solana", "tron"];
  const nodes = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => {
        const ai = order.indexOf(a.name.toLowerCase());
        const bi = order.indexOf(b.name.toLowerCase());
        if (ai >= 0 || bi >= 0) {
          return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        }
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

  return order.map(
    (walletType) =>
      nodes.find((node) => node.walletType == walletType) || {
        type: "folder",
        label: getWalletTypeLabel(walletType),
        walletType,
        filePath: "",
        children: [],
      },
  );
}

function getRouteLabel(folder = "") {
  return String(folder || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();
}

function isPublicRouteFolder(folder = "") {
  return ![".", "_", "@", "[", "("].includes(String(folder || "")[0]);
}

async function readRouteNavChildren(
  dir,
  routeBase,
  routeParts = [],
  knownEntries,
) {
  const entries =
    knownEntries ||
    (await fs
      .readdir(dir, { withFileTypes: true })
      .catch((error) =>
        error.code == "ENOENT" ? [] : Promise.reject(error),
      ));
  const folders = entries
    .filter((entry) => entry.isDirectory() && isPublicRouteFolder(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const children = await Promise.all(
    folders.map(async (entry) => {
      const parts = [...routeParts, entry.name];
      const folderPath = path.join(dir, entry.name);
      const folderEntries = await fs.readdir(folderPath, {
        withFileTypes: true,
      });
      const hasPage = folderEntries.some(
        (child) => child.isFile() && routePageFilePattern.test(child.name),
      );
      const nestedChildren = await readRouteNavChildren(
        folderPath,
        routeBase,
        parts,
        folderEntries,
      );
      if (!hasPage && !nestedChildren.length) return null;

      const href = hasPage ? `${routeBase}/${parts.join("/")}` : "";

      return {
        value: entry.name,
        label: getRouteLabel(entry.name),
        href,
        title: href,
        disabled: !hasPage,
        children: nestedChildren,
      };
    }),
  );

  return children.filter(Boolean);
}

async function buildRouteNavTree(routeFolder) {
  const routeBase = `/${routeFolder}`;
  return readRouteNavChildren(
    path.join(process.cwd(), "app", routeFolder),
    routeBase,
  );
}

async function readEditorNavigation(dir, relPath = "") {
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch((error) =>
      error.code == "ENOENT" ? [] : Promise.reject(error),
    );
  const sortedEntries = entries.sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const files = [];
  const emptyFolders = relPath && !sortedEntries.length ? [relPath] : [];

  for (const entry of sortedEntries) {
    const filePath = [relPath, entry.name].filter(Boolean).join("/");
    if (entry.isDirectory()) {
      const nested = await readEditorNavigation(
        path.join(dir, entry.name),
        filePath,
      );
      files.push(...nested.files);
      emptyFolders.push(...nested.emptyFolders);
    } else if (
      entry.isFile() &&
      allowedEditorExts.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(filePath);
    }
  }

  return { files, emptyFolders };
}

async function buildEditorNavigation() {
  const { files: editorFiles, emptyFolders: editorEmptyFolders } =
    await readEditorNavigation(
      path.join(process.cwd(), "data", "editor"),
    );

  return {
    editorFiles,
    editorEmptyFolders,
    editorNavTree: buildEditorNavTree(editorFiles, editorEmptyFolders),
  };
}

export const getWalletNavTree = cache(buildWalletNavTree);
export const getRouteNavTree = cache(buildRouteNavTree);

export const getNavigationTrees = cache(async () => {
  const [walletNavTree, refNavTree, dataNavTree, editorNavigation] =
    await Promise.all([
      getWalletNavTree(),
      getRouteNavTree("ref"),
      getRouteNavTree("d"),
      buildEditorNavigation(),
    ]);

  return {
    walletNavTree,
    refNavTree,
    dataNavTree,
    ...editorNavigation,
  };
});
