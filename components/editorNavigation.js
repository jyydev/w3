const allowedEditorExtensions = new Set([".json", ".txt", ".js"]);

export function normalizeEditorFilePath(file) {
  if (typeof file != "string") throw new Error("Missing file name");

  const normalized = file.trim();
  if (!normalized) throw new Error("Missing file name");
  if (normalized.includes("\0")) throw new Error("Invalid file name");
  if (normalized.includes("\\")) {
    throw new Error("Use forward slashes in editor file names");
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error("Use a relative file name");
  }

  const parts = normalized.split("/");
  if (
    parts.some(
      (part) => !part || !part.trim() || part == "." || part == "..",
    )
  ) {
    throw new Error("Invalid editor file path");
  }

  const fileName = parts.at(-1);
  const dotIndex = fileName.lastIndexOf(".");
  const extension =
    dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : "";
  if (!allowedEditorExtensions.has(extension)) {
    throw new Error("Use .json, .txt, or .js files only");
  }

  return parts.join("/");
}

export function normalizeEditorFolderPath(folder) {
  if (typeof folder != "string") throw new Error("Missing folder name");

  const normalized = folder.trim();
  if (!normalized) throw new Error("Missing folder name");
  if (normalized.includes("\0")) throw new Error("Invalid folder name");
  if (normalized.includes("\\")) {
    throw new Error("Use forward slashes in editor folder names");
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error("Use a relative folder name");
  }

  const parts = normalized.split("/");
  if (
    parts.some(
      (part) => !part || !part.trim() || part == "." || part == "..",
    )
  ) {
    throw new Error("Invalid editor folder path");
  }

  return parts.join("/");
}

export function getEditorFileHref(file) {
  const normalized = normalizeEditorFilePath(file);
  return `/editor/${normalized
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function sortEditorNodes(a, b) {
  const aFolder = a.type == "folder";
  const bFolder = b.type == "folder";
  if (aFolder != bFolder) return aFolder ? -1 : 1;
  return a.label.localeCompare(b.label);
}

function createEditorFolderNode(folder, label) {
  return {
    type: "folder",
    homeKey: `editor:folder:${folder}`,
    editorFolder: folder,
    value: label,
    label,
    href: "",
    title: folder,
    disabled: true,
    deletable: null,
    children: [],
  };
}

function ensureEditorFolder(root, folder) {
  const parts = folder.split("/");
  let children = root;

  parts.forEach((part, index) => {
    const currentPath = parts.slice(0, index + 1).join("/");
    let node = children.find((entry) => entry.value == part);

    if (!node) {
      node = createEditorFolderNode(currentPath, part);
      children.push(node);
    }

    children = node.children;
  });
}

export function buildEditorNavTree(files = [], emptyFolders = []) {
  const root = [];
  const normalizedFiles = [];
  const normalizedEmptyFolders = [];
  const seen = new Set();
  const seenFolders = new Set();

  for (const folder of Array.isArray(emptyFolders) ? emptyFolders : []) {
    let normalized = "";
    try {
      normalized = normalizeEditorFolderPath(folder);
    } catch {
      continue;
    }
    if (seenFolders.has(normalized)) continue;
    seenFolders.add(normalized);
    normalizedEmptyFolders.push(normalized);
  }

  normalizedEmptyFolders.sort((a, b) => a.localeCompare(b));
  normalizedEmptyFolders.forEach((folder) =>
    ensureEditorFolder(root, folder),
  );

  for (const file of Array.isArray(files) ? files : []) {
    let normalized = "";
    try {
      normalized = normalizeEditorFilePath(file);
    } catch {
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedFiles.push(normalized);
  }

  normalizedFiles.sort((a, b) => a.localeCompare(b));

  for (const file of normalizedFiles) {
    const parts = file.split("/");
    let children = root;

    parts.forEach((part, index) => {
      const currentPath = parts.slice(0, index + 1).join("/");
      const isFile = index == parts.length - 1;
      let node = children.find((entry) => entry.value == part);

      if (!node) {
        node = isFile
          ? {
              type: "file",
              homeKey: `editor:file:${currentPath}`,
              editorFile: file,
              value: part,
              label: part,
              href: getEditorFileHref(file),
              title: file,
              disabled: false,
              children: [],
            }
          : createEditorFolderNode(currentPath, part);
        children.push(node);
      }

      children = node.children;
    });
  }

  function sortTree(nodes) {
    nodes.sort(sortEditorNodes);
    nodes.forEach((node) => {
      sortTree(node.children || []);
      if (node.type == "folder") {
        node.deletable =
          !node.children.length && seenFolders.has(node.editorFolder)
            ? { kind: "folder", source: node.editorFolder }
            : null;
      }
    });
    return nodes;
  }

  return sortTree(root);
}
