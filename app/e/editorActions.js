"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { normalizeEditorFolderPath } from "@/components/editorNavigation";
import {
  projectFileWriteBlockedResult,
  projectFileWritesDisabled,
} from "../_editorData/projectFileWrites";

const editorDataDir = path.join(process.cwd(), "data", "editor");

function resolveEditorFolder(folder) {
  const source = normalizeEditorFolderPath(folder);
  const folderPath = path.resolve(editorDataDir, source);
  const relative = path.relative(editorDataDir, folderPath);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Folder must stay inside data/editor");
  }

  return { folderPath, source };
}

export async function deleteEmptyEditorFolder({ folder = "" } = {}) {
  if (projectFileWritesDisabled()) {
    return projectFileWriteBlockedResult();
  }

  const { folderPath, source } = resolveEditorFolder(folder);
  const stat = await fs.lstat(folderPath).catch((error) => {
    if (error.code != "ENOENT") throw error;
    return null;
  });
  if (!stat?.isDirectory()) {
    return { ok: false, msg: "folder not found" };
  }

  const [realEditorDataDir, realFolderPath] = await Promise.all([
    fs.realpath(editorDataDir),
    fs.realpath(folderPath),
  ]);
  const realRelative = path.relative(realEditorDataDir, realFolderPath);
  if (
    !realRelative ||
    realRelative.startsWith("..") ||
    path.isAbsolute(realRelative)
  ) {
    return { ok: false, msg: "invalid editor folder" };
  }

  const entries = await fs.readdir(folderPath);
  if (entries.length) {
    return { ok: false, msg: "folder is not empty" };
  }

  await fs.rmdir(folderPath);
  revalidatePath("/e");

  return { ok: true, folder: source };
}
